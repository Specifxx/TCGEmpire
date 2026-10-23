// Everything the checks need from the outside world, as one injectable bundle. The
// real implementations live in real-deps.ts; the tests pass fakes. Nothing in
// checks.ts imports a database client, reads the environment or calls fetch directly.
import type { InboxCounts } from "./types";
import type { TransferSample } from "./thresholds";
import type { FetchLike } from "./neon";

export interface MarketFreshness {
  country: string;
  newest: Date | null;
  inStock: number;
}

export interface WorkflowRun {
  status: string;
  conclusion: string | null;
  createdAt: Date;
}

export interface OpsDeps {
  now: Date;
  /** Names to values. Checks read only the names they document. */
  env: Record<string, string | undefined>;
  fetch: FetchLike;
  sleep(ms: number): Promise<void>;

  /** The operational database, or null where the caller has no connection to it. */
  db: null | {
    /** Resolves when `SELECT 1` answers; rejects with the driver's error otherwise. */
    ping(): Promise<void>;
    priceFreshness(): Promise<MarketFreshness[]>;
    sealedNewest(): Promise<Date | null>;
    auctions(): Promise<{ newestUpdate: Date | null; count: number }>;
    ebayAdsNewest(): Promise<Date | null>;
    storeHealthNewest(): Promise<Date | null>;
    inbox(): Promise<InboxCounts>;
    /** Stores plans (lib/store-plan.ts): how many exist, and the paid ones not yet linked to a tracked store. */
    storePlans?(): Promise<{ total: number; unlinked: { storeName: string; createdAt: Date; activeUntil: Date | null }[] }>;
  };

  /** Files from a checkout of the repository; absent on the website. */
  repo?: {
    newestHistoryDay(): string | null;
    publicSnapshotAt(): Date | null;
  };

  /** The GitHub API for this repository; absent when there is no token. */
  github?: {
    /** Newest runs of one workflow file, newest first. */
    runs(workflowFile: string): Promise<WorkflowRun[]>;
    /** State of the newest Production deployment: "success", "failure", "in_progress" … */
    productionDeploy(): Promise<{ state: string; description: string; createdAt: Date } | null>;
  };

  /** Connection strings, used only to find the Neon project. Never logged. */
  databaseUrls: { operational: string | null; history: string | null };

  /** Carried between runs. */
  state: { neonProjects: Record<string, string>; samples: Record<string, TransferSample[]> };
}

export const SITE = "https://riftcompare.com";
