import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DashboardData, Match } from "./types.js";

const DATA_DIR = path.resolve("data");
const PUBLIC_DATA_DIR = path.resolve("public/data");
const SEEN_PATH = path.join(DATA_DIR, "seen.json");
const DASHBOARD_PATH = path.join(PUBLIC_DATA_DIR, "jobs.json");

export interface SeenState {
  initializedAt: string | null;
  jobs: Record<string, { firstSeenAt: string; lastSeenAt: string }>;
}

export async function loadSeenState(): Promise<SeenState> {
  try {
    return JSON.parse(await readFile(SEEN_PATH, "utf8")) as SeenState;
  } catch {
    return { initializedAt: null, jobs: {} };
  }
}

export function applySeenState(matches: Match[], state: SeenState, scannedAt: string): Match[] {
  const isInitialRun = state.initializedAt === null;
  if (isInitialRun) state.initializedAt = scannedAt;

  return matches.map((match) => {
    const existing = state.jobs[match.id];
    const firstSeenAt = existing?.firstSeenAt ?? scannedAt;
    state.jobs[match.id] = { firstSeenAt, lastSeenAt: scannedAt };
    return { ...match, firstSeenAt, isNew: !isInitialRun && !existing };
  });
}

export async function persistState(state: SeenState, dashboard: DashboardData): Promise<void> {
  await Promise.all([
    mkdir(DATA_DIR, { recursive: true }),
    mkdir(PUBLIC_DATA_DIR, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(SEEN_PATH, `${JSON.stringify(state, null, 2)}\n`),
    writeFile(DASHBOARD_PATH, `${JSON.stringify(dashboard, null, 2)}\n`),
  ]);
}
