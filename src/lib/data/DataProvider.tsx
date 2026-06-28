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
import { snapshotRepository } from "./snapshot";
import { dataApi, isLiveBackend } from "./snapshot-client";
import { hasAppKey } from "../sharepoint/client";

type Source = "seed" | "live";
type Status = "idle" | "loading" | "ok" | "error";

interface DataContextValue {
  repo: DiligenceRepository;
  source: Source;
  status: Status;
  error: string | null;
  /** True when a live backend is configured for this build. */
  liveConfigured: boolean;
  /** Re-fetch the live snapshot (no-op when not live). */
  refresh: () => void;
}

const seedRepo = snapshotRepository(seedSnapshot());

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const liveConfigured = isLiveBackend();
  const [repo, setRepo] = useState<DiligenceRepository>(seedRepo);
  const [source, setSource] = useState<Source>("seed");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!liveConfigured || !hasAppKey()) {
      setSource("seed");
      setRepo(seedRepo);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    dataApi
      .snapshot()
      .then((snap) => {
        if (cancelled) return;
        setRepo(snapshotRepository(snap));
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

  const value = useMemo<DataContextValue>(
    () => ({ repo, source, status, error, liveConfigured, refresh }),
    [repo, source, status, error, liveConfigured, refresh],
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
  const { repo, source } = useData();
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

  return { data, loading, source };
}
