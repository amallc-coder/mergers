"use client";

/**
 * Runtime data provider.
 *
 * Picks the data source at runtime in the browser:
 *  - Live: when NEXT_PUBLIC_DATA_BACKEND=supabase and the access passcode is set,
 *    it fetches the whole dataset from the gated `data` Edge Function and serves
 *    every page from it (always fresh on load).
 *  - Seed: when the backend is off or the passcode isn't entered, it serves the
 *    in-memory seed snapshot (sample data) so the app always renders.
 *
 * A live fetch that FAILS never falls back to seed — substituting sample
 * financials for real ones would silently mislead. Instead it keeps the last
 * loaded live data (if any) and exposes status="error" so the UI shows a retry.
 *
 * Pages call `useRepo()` to get a `DiligenceRepository` plus the source + status.
 * Because the site is a static export, this is how tabs read real data without a
 * server: the fetch happens client-side after hydration.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DiligenceRepository } from "./repository";
import { seedSnapshot } from "./seed-snapshot";
import { snapshotRepository, type Snapshot } from "./snapshot";
import { dataApi, isLiveBackend } from "./snapshot-client";
import { hasAppKey, setAppKey, sharePoint, INTAKE_HOME } from "../sharepoint/client";
import {
  DEFAULT_PIPELINE_STAGES,
  type AlertRoute,
  type Communication,
  type ContactLink,
  type Message,
  type Person,
  type PipelineStage,
} from "../domain/types";

export interface NewTransactionInput {
  practiceName: string;
  name?: string;
  specialty?: string;
  state?: string;
  stage?: string;
  actorName?: string;
  sellerName?: string;
  sellerEmail?: string;
}

export interface CreateResult {
  id: string;
  sharePointFolderUrl?: string;
  provisioningError?: string;
}

type Source = "seed" | "live" | "locked";
// "loading" = first live fetch (blank + spinner). "refreshing" = a background
// refetch while real data stays on screen. "error" = a live fetch failed; we
// never substitute seed data, so the UI shows an error/retry, not fake figures.
type Status = "idle" | "loading" | "refreshing" | "ok" | "error";

interface DataContextValue {
  repo: DiligenceRepository;
  source: Source;
  status: Status;
  error: string | null;
  /** The configurable pipeline stages (live config, or the seed default). */
  pipelineStages: PipelineStage[];
  /** Feature 3 — global contacts, their deal links, comms log, alert routing. */
  people: Person[];
  contactLinks: ContactLink[];
  communications: Communication[];
  /** Per-transaction seller↔buyer message threads. */
  messages: Message[];
  alertRouting: AlertRoute[];
  /** True when a live backend is configured for this build. */
  liveConfigured: boolean;
  /** True while the first live snapshot is still loading — views should show a
   *  loading state rather than the empty/seed dataset (prevents the demo flash). */
  awaitingLive: boolean;
  /** Re-fetch the live snapshot (no-op when not live). */
  refresh: () => void;
  /** Move a deal to a new stage (live only); refreshes the snapshot after. */
  setStage: (transactionId: string, stage: string, actorName?: string) => Promise<void>;
  /** Create a deal, then provision its SharePoint data room (live only). The
   *  transaction is saved even if provisioning fails (provisioningError set). */
  createTransaction: (input: NewTransactionInput) => Promise<CreateResult>;
  /** Retry SharePoint provisioning for a transaction whose first attempt failed. */
  provisionDataRoom: (transactionId: string, practiceName: string) => Promise<string>;
  /** Contacts (live only). All refresh the snapshot after. */
  addContact: (input: {
    transactionId?: string;
    type?: string;
    name: string;
    email: string;
    phone?: string;
    role?: string;
    isPrimary?: boolean;
    functionalRoles?: string[];
  }) => Promise<void>;
  updateContact: (contactId: string, patch: Record<string, unknown>) => Promise<void>;
  linkContact: (contactId: string, transactionId: string, role?: string) => Promise<void>;
  unlinkContact: (contactId: string, transactionId: string) => Promise<void>;
  /** Messaging (live only). All refresh the snapshot after. */
  postMessage: (input: {
    transactionId: string;
    body: string;
    direction?: "internal" | "to_seller" | "from_seller";
    subject?: string;
    authorName?: string;
    relatedMetricKey?: string;
    toEmail?: string;
    toName?: string;
    contactId?: string;
  }) => Promise<void>;
  raiseClarification: (input: {
    transactionId: string;
    question: string;
    title?: string;
    metricKey?: string;
    category?: string;
    actorName?: string;
    toEmail?: string;
    toName?: string;
    contactId?: string;
  }) => Promise<void>;
  markMessagesRead: (transactionId: string) => Promise<void>;
}

const seedSnap = seedSnapshot();
const seedRepo = snapshotRepository(seedSnap);

// An empty dataset shown while the live snapshot is loading, so the seed/demo data
// never flashes before the real data arrives. Views render their loading state
// (driven by `awaitingLive`) instead of the sample deals.
const emptySnap: Snapshot = {
  org: seedSnap.org,
  pipelineStages: DEFAULT_PIPELINE_STAGES,
  people: [],
  contactLinks: [],
  communications: [],
  messages: [],
  alertRouting: [],
  users: [],
  transactions: [],
  contacts: [],
  requestItems: [],
  documents: [],
  metrics: [],
  riskFlags: [],
  tasks: [],
  meetings: [],
  comments: [],
  activity: [],
  sellerPortalUsers: [],
};
const emptyRepo = snapshotRepository(emptySnap);

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const liveConfigured = isLiveBackend();
  const [repo, setRepo] = useState<DiligenceRepository>(seedRepo);
  const [source, setSource] = useState<Source>("seed");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // True once a live snapshot has loaded. Read inside the effect (via a ref so it
  // isn't an effect dependency) to keep the last-known-good data on a failed refresh.
  const loadedLiveRef = useRef(false);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>(
    seedSnap.pipelineStages ?? DEFAULT_PIPELINE_STAGES,
  );
  const [people, setPeople] = useState<Person[]>(seedSnap.people ?? []);
  const [contactLinks, setContactLinks] = useState<ContactLink[]>(seedSnap.contactLinks ?? []);
  const [communications, setCommunications] = useState<Communication[]>(seedSnap.communications ?? []);
  const [messages, setMessages] = useState<Message[]>(seedSnap.messages ?? []);
  const [alertRouting, setAlertRouting] = useState<AlertRoute[]>(seedSnap.alertRouting ?? []);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!liveConfigured) {
      // No backend configured (local dev / offline demo build): serve the seed
      // sample data so the app is explorable. This is the ONLY path that shows
      // demo data — a configured production build never falls back to it.
      setSource("seed");
      setRepo(seedRepo);
      setPipelineStages(seedSnap.pipelineStages ?? DEFAULT_PIPELINE_STAGES);
      setPeople(seedSnap.people ?? []);
      setContactLinks(seedSnap.contactLinks ?? []);
      setCommunications(seedSnap.communications ?? []);
      setMessages(seedSnap.messages ?? []);
      setAlertRouting(seedSnap.alertRouting ?? []);
      setStatus("idle");
      return;
    }
    if (!hasAppKey()) {
      // Live backend IS configured but locked (no passcode yet — e.g. right after a
      // cache clear wipes localStorage). The database is the source of truth here, so
      // we show an empty, LOCKED state and prompt for the passcode — never the demo
      // data. Entering the passcode (at sign-in or via the banner) unlocks it.
      setSource("locked");
      setRepo(emptyRepo);
      setPipelineStages(DEFAULT_PIPELINE_STAGES);
      setPeople([]);
      setContactLinks([]);
      setCommunications([]);
      setMessages([]);
      setAlertRouting([]);
      setStatus("idle");
      loadedLiveRef.current = false;
      return;
    }
    let cancelled = false;
    if (loadedLiveRef.current) {
      // We already have real data — refetch in the background, keeping it on
      // screen (awaitingLive stays false, so no spinner wipes the view).
      setStatus("refreshing");
    } else {
      // First load: clear any seed/demo data so it never flashes; views key off
      // `awaitingLive` (status === "loading") to show a spinner until live arrives.
      setSource("seed");
      setRepo(emptyRepo);
      setPeople([]);
      setContactLinks([]);
      setCommunications([]);
      setMessages([]);
      setAlertRouting([]);
      setStatus("loading");
    }
    setError(null);
    dataApi
      .snapshot()
      .then((snap) => {
        if (cancelled) return;
        setRepo(snapshotRepository(snap));
        setPipelineStages(
          snap.pipelineStages?.length ? snap.pipelineStages : DEFAULT_PIPELINE_STAGES,
        );
        setPeople(snap.people ?? []);
        setContactLinks(snap.contactLinks ?? []);
        setCommunications(snap.communications ?? []);
        setMessages(snap.messages ?? []);
        setAlertRouting(snap.alertRouting ?? []);
        setSource("live");
        setStatus("ok");
        loadedLiveRef.current = true;
      })
      .catch((e) => {
        if (cancelled) return;
        // NEVER fall back to seed: showing fabricated financials as if they were
        // real is worse than an error. Keep the last-known-good live data if we
        // have it; otherwise the empty dataset stays and views render their empty
        // state. Either way `status="error"` drives a visible retry banner.
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [liveConfigured, tick]);

  const setStage = useCallback(
    async (transactionId: string, stage: string, actorName?: string) => {
      // Writes only land on the live backend; in seed mode the pipeline is a demo.
      if (source !== "live") throw new Error("Unlock the live backend to change stages.");
      await dataApi.setStage(transactionId, stage, actorName);
      refresh();
    },
    [source, refresh],
  );

  const provisionDataRoom = useCallback(
    async (transactionId: string, practiceName: string) => {
      // Provision the data room under the M&A Diligence home, then store the URL.
      const res = await sharePoint.ensureDataRoom(practiceName, INTAKE_HOME);
      const url = res.dataRoom.webUrl;
      await dataApi.patchTransaction(transactionId, { sharePointFolderUrl: url });
      refresh();
      return url;
    },
    [refresh],
  );

  const createTransaction = useCallback(
    async (input: NewTransactionInput): Promise<CreateResult> => {
      if (source !== "live") throw new Error("Unlock the live backend to create deals.");
      const { id } = await dataApi.createTransaction({
        practiceName: input.practiceName,
        name: input.name,
        specialty: input.specialty,
        state: input.state,
        stage: input.stage,
        actorName: input.actorName,
      });
      // Attach the seller contact if provided (best-effort).
      if (input.sellerEmail && input.sellerName) {
        try {
          await dataApi.addContact({
            transactionId: id,
            type: "external",
            name: input.sellerName,
            email: input.sellerEmail,
            role: "Seller",
            isPrimary: true,
          });
        } catch {
          /* non-fatal */
        }
      }
      // Provision the SharePoint data room. The deal is already saved, so a Graph
      // failure is surfaced (with a retry path) rather than rolling anything back.
      let sharePointFolderUrl: string | undefined;
      let provisioningError: string | undefined;
      try {
        sharePointFolderUrl = await provisionDataRoom(id, input.practiceName);
      } catch (e) {
        provisioningError = e instanceof Error ? e.message : String(e);
        refresh();
      }
      return { id, sharePointFolderUrl, provisioningError };
    },
    [source, provisionDataRoom, refresh],
  );

  const requireLive = useCallback(() => {
    if (source !== "live") throw new Error("Unlock the live backend to make changes.");
  }, [source]);

  const addContact = useCallback(
    async (input: Parameters<DataContextValue["addContact"]>[0]) => {
      requireLive();
      await dataApi.addContact(input);
      refresh();
    },
    [requireLive, refresh],
  );
  const updateContact = useCallback(
    async (contactId: string, patch: Record<string, unknown>) => {
      requireLive();
      await dataApi.updateContact(contactId, patch);
      refresh();
    },
    [requireLive, refresh],
  );
  const linkContact = useCallback(
    async (contactId: string, transactionId: string, role?: string) => {
      requireLive();
      await dataApi.linkContact(contactId, transactionId, role);
      refresh();
    },
    [requireLive, refresh],
  );
  const unlinkContact = useCallback(
    async (contactId: string, transactionId: string) => {
      requireLive();
      await dataApi.unlinkContact(contactId, transactionId);
      refresh();
    },
    [requireLive, refresh],
  );
  const postMessage = useCallback(
    async (input: Parameters<DataContextValue["postMessage"]>[0]) => {
      requireLive();
      await dataApi.postMessage(input);
      refresh();
    },
    [requireLive, refresh],
  );
  const raiseClarification = useCallback(
    async (input: Parameters<DataContextValue["raiseClarification"]>[0]) => {
      requireLive();
      await dataApi.raiseClarification(input);
      refresh();
    },
    [requireLive, refresh],
  );
  const markMessagesRead = useCallback(
    async (transactionId: string) => {
      if (source !== "live") return; // no-op in sample mode
      await dataApi.markMessagesRead(transactionId);
      refresh();
    },
    [source, refresh],
  );

  // We're awaiting the first live snapshot whenever a live fetch is in flight; while
  // true the repo is the empty dataset, so views show a spinner, not seed/empty data.
  const awaitingLive = status === "loading";

  const value = useMemo<DataContextValue>(
    () => ({
      repo, source, status, error, pipelineStages,
      people, contactLinks, communications, messages, alertRouting,
      liveConfigured, awaitingLive, refresh, setStage, createTransaction, provisionDataRoom,
      addContact, updateContact, linkContact, unlinkContact,
      postMessage, raiseClarification, markMessagesRead,
    }),
    [
      repo, source, status, error, pipelineStages,
      people, contactLinks, communications, messages, alertRouting,
      liveConfigured, awaitingLive, refresh, setStage, createTransaction, provisionDataRoom,
      addContact, updateContact, linkContact, unlinkContact,
      postMessage, raiseClarification, markMessagesRead,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

/**
 * Visible, blocking signal that a live fetch failed — so a backend hiccup never
 * silently leaves stale/empty data on screen with no explanation. Renders nothing
 * on the happy path. Mount it once in the app shell.
 */
export function LiveDataBanner() {
  const { status, error, source, refresh } = useData();
  const [passcode, setPasscode] = useState("");

  // Locked: live backend configured but no passcode (e.g. after a cache clear).
  // Offer an inline unlock so the user never has to hunt for where to re-enter it,
  // and never sees demo data in its place.
  if (source === "locked") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!passcode.trim()) return;
          setAppKey(passcode.trim());
          setPasscode("");
          refresh();
        }}
        className="flex flex-wrap items-center gap-2 border-b border-ochre-200 bg-ochre-50 px-4 py-2 text-sm text-ochre-700 sm:px-6 lg:px-8"
      >
        <span className="min-w-0 flex-1">Enter your access passcode to load live data.</span>
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Access passcode"
          className="w-44 rounded-md border border-ochre-300 bg-panel px-2 py-1 text-xs outline-none focus:border-ochre-500"
        />
        <button
          type="submit"
          disabled={!passcode.trim()}
          className="shrink-0 rounded-md bg-ink-900 px-2.5 py-1 text-xs font-medium text-paper hover:bg-ink-800 disabled:opacity-50"
        >
          Unlock
        </button>
      </form>
    );
  }

  if (status !== "error") return null;
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 border-b border-rust-200 bg-rust-50 px-4 py-2 text-sm text-rust-700 sm:px-6 lg:px-8"
    >
      <span className="min-w-0 truncate">
        {source === "live"
          ? "Showing the last loaded data — couldn’t reach the live backend."
          : "Couldn’t load live data."}
        {error ? <span className="text-rust-400"> ({error})</span> : null}
      </span>
      <button
        onClick={refresh}
        className="shrink-0 rounded-md bg-rust-600 px-2.5 py-1 text-xs font-medium text-paper hover:bg-rust-700"
      >
        Retry
      </button>
    </div>
  );
}

/** Convenience: just the repository. */
export function useRepo(): DiligenceRepository {
  return useData().repo;
}

/**
 * Run an async loader against the active repository, re-running whenever the
 * data source changes (seed → live after the passcode unlocks). The `loader`
 * should be a stable closure over the repo only; it is intentionally not in the
 * dependency list (it is recreated each render).
 */
export function useRepoData<T>(
  loader: (repo: DiligenceRepository) => Promise<T>,
): { data: T | null; loading: boolean; source: Source } {
  const { repo, source, awaitingLive } = useData();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.resolve(loader(repo))
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  // While the first live snapshot is still loading the repo is empty; report
  // loading so pages show a spinner instead of an empty (or seed) dataset.
  return { data, loading: loading || awaitingLive, source };
}
