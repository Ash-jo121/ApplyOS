import { COMPANIES, SCHEDULE_HOURS } from "./config.js";
import { matchJob } from "./matcher.js";
import { notificationConfig, sendNotifications } from "./notifiers.js";
import { fetchCompanyJobs } from "./sources.js";
import { applySeenState, loadSeenState, persistState } from "./state.js";
import type { Company, CompanyStatus, Job, Match } from "./types.js";

const shouldNotify = process.argv.includes("--notify");
const notifyExisting = process.argv.includes("--notify-existing");
const scannedAt = new Date().toISOString();

async function scanCompany(company: Company): Promise<{ jobs: Job[]; status: CompanyStatus }> {
  const start = Date.now();
  try {
    const jobs = await fetchCompanyJobs(company);
    const matches = jobs.map((job) => matchJob(job)).filter((job): job is Match => job !== null);
    return {
      jobs,
      status: {
        companyId: company.id,
        company: company.name,
        source: company.source,
        state: "healthy",
        jobsFound: jobs.length,
        matchesFound: matches.length,
        checkedAt: scannedAt,
        durationMs: Date.now() - start,
      },
    };
  } catch (error) {
    return {
      jobs: [],
      status: {
        companyId: company.id,
        company: company.name,
        source: company.source,
        state: "degraded",
        jobsFound: 0,
        matchesFound: 0,
        checkedAt: scannedAt,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function main() {
  console.log(`ApplyOS scan started for ${COMPANIES.length} companies`);
  const results = await mapWithConcurrency(
    COMPANIES.filter((company) => company.enabled),
    3,
    async (company) => {
      const result = await scanCompany(company);
      const marker = result.status.state === "healthy" ? "✓" : "!";
      console.log(
        `${marker} ${company.name}: ${result.status.jobsFound} jobs, ${result.status.matchesFound} matches (${result.status.durationMs}ms)`,
      );
      return result;
    },
  );

  const state = await loadSeenState();
  const wasInitialized = state.initializedAt !== null;
  const currentMatches = results
    .flatMap((result) => result.jobs)
    .map((job) => matchJob(job))
    .filter((job): job is Match => job !== null);
  const matches = applySeenState(currentMatches, state, scannedAt).sort(
    (a, b) => Number(b.isNew) - Number(a.isNew) || b.score - a.score,
  );
  const newMatches = matches.filter((match) => match.isNew || (!wasInitialized && notifyExisting));
  const notifications = notificationConfig();

  if (shouldNotify && newMatches.length) {
    try {
      const sent = await sendNotifications(newMatches);
      console.log(`Notifications: email=${sent.email ? "sent" : "not configured"}, WhatsApp=${sent.whatsapp ? "sent" : "not configured"}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }

  await persistState(state, {
    generatedAt: scannedAt,
    scheduleHours: SCHEDULE_HOURS,
    matches,
    statuses: results.map((result) => result.status),
    notifications: { ...notifications, newMatches: newMatches.length },
  });

  const degraded = results.filter((result) => result.status.state === "degraded").length;
  console.log(`Scan complete: ${matches.length} active matches, ${newMatches.length} new, ${degraded} degraded sources`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
