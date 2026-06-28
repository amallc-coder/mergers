"use client";

/**
 * Runtime data provider.
 *
 * Picks the data source at runtime in the browser:
 *  - Live: when NEXT_PUBLIC_DATA_BACKEND=supabase and the access passcode is set,
 *    it fetches the whole dataset from the gated `data` Edge Function and serves
 *    every page from it (always fresh on load).
 *  - Seed: otherwise (passcode not entered, backend off, or fetch failed) it
 *    falls back to the in-memory seed snapshot so the app always renders.
 *
 * Pages call `useRepo()` to get a `DiligenceRepository` plus the source + status.
 * Because the site is a static export, this is how tabs read real data without a
 * server: the fetch happens client-side after hydration.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DiligenceRepository } from "./repository";
import { seedSnapshot } from "./seed-snapshot";
import { snapshotRepository, type Snapshot } from "./snapshot";
import { dataApi, isLiveBackend } from "./snapshot-client";
import { hasAppKey, sharePoint, INTAKE_HOME } from "../sharepoint/client";
import {
  DEFAULT_PIPELINE_STAGES,
  type AlertRoute,
  type Communication,
  type ContactLink,
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

type Source = "seed" | "live";
type Status = "idle" | "loading" | "ok" | "error";

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
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>(
    seedSnap.pipelineStages ?? DEFAULT_PIPELINE_STAGES,
  );
  const [people, setPeople] = useState<Person[]>(seedSnap.people ?? []);
  const [contactLinks, setContactLinks] = useState<ContactLink[]>(seedSnap.contactLinks ?? []);
  const [communications, setCommunications] = useState<Communication[]>(seedSnap.communications ?? []);
  const [alertRouting, setAlertRouting] = useState<AlertRoute[]>(seedSnap.alertRouting ?? []);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!liveConfigured || !hasAppKey()) {
      setSource("seed");
      setRepo(seedRepo);
      setPipelineStages(seedSnap.pipelineStages ?? DEFAULT_PIPELINE_STAGES);
      setPeople(seedSnap.people ?? []);
      setContactLinks(seedSnap.contactLinks ?? []);
      setCommunications(seedSnap.communications ?? []);
      setAlertRouting(seedSnap.alertRouting ?? []);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    // Clear any seed/demo data immediately so it never flashes under the live load.
    // Views key off `awaitingLive` (status === "loading") to show a spinner instead.
    setSource("seed");
    setRepo(emptyRepo);
    setPeople([]);
    setContactLinks([]);
    setCommunications([]);
    setAlertRouting([]);
    setStatus("loading");
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
        setAlertRouting(snap.alertRouting ?? []);
        setSource("live");
        setStatus("ok");
      })
      .catch((e) => {
        if (cancelled) return;
        // Fall back to seed so the app still renders; surface the error.
        setRepo(seedRepo);
        setSource("seed");
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

  // We're awaiting the first live snapshot whenever a live fetch is in flight; while
  // true the repo is the empty dataset, so views show a spinner, not seed/empty data.
  const awaitingLive = status === "loading";

  const value = useMemo<DataContextValue>(
    () => ({
      repo, source, status, error, pipelineStages,
      people, contactLinks, communications, alertRouting,
      liveConfigured, awaitingLive, refresh, setStage, createTransaction, provisionDataRoom,
      addContact, updateContact, linkContact, unlinkContact,
    }),
    [
      repo, source, status, error, pipelineStages,
      people, contactLinks, communications, alertRouting,
      liveConfigured, awaitingLive, refresh, setStage, createTransaction, provisionDataRoom,
      addContact, updateContact, linkContact, unlinkContact,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
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
