import * as path from "path";
import * as fs from "fs";
import { Resume, ScrapeResult, TargetCompany } from "./types/Scraper";
import { ScraperFactory } from "./core/ScraperFactory";
import { filterByKeywords } from "./utils/FilterbyKeywords";

// ─── Load config files ────────────────────────────────────────────────────────

const ASSETS_DIR = path.join(__dirname, "../assets");

function loadJson<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, filename), "utf-8"));
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

async function scrapeCompany(
  company: TargetCompany,
  keywords: string[],
): Promise<ScrapeResult> {
  try {
    const scraper = await ScraperFactory.fromCompany(company);
    const allJobs = await scraper.fetchJobs();
    const matchedJobs = filterByKeywords(allJobs, keywords);

    return {
      companyName: company.companyName,
      totalJobs: allJobs.length,
      matchedJobs,
    };
  } catch (err: any) {
    return {
      companyName: company.companyName,
      totalJobs: 0,
      matchedJobs: [],
      error: err.message,
    };
  }
}

async function main() {
  // Global keywords — in the real UI, user sets these once
  const keywords = ["frontend", "ui", "React", "Angular"];

  const companies = loadJson<TargetCompany[]>("target-companies.json");
  const resume = loadJson<Resume>("resume.json");

  console.log("ApplyOS booting...");
  console.log(`Keywords: [${keywords.join(", ")}]`);
  console.log(`Companies: ${companies.map((c) => c.companyName).join(", ")}\n`);

  const results: ScrapeResult[] = [];

  for (const company of companies) {
    console.log(
      `\n── ${company.companyName} ${"─".repeat(40 - company.companyName.length)}`,
    );
    const result = await scrapeCompany(company, keywords);
    results.push(result);

    if (result.error) {
      console.log(`  ✗ ${result.error}`);
      continue;
    }

    console.log(
      `  Total: ${result.totalJobs} | Matched: ${result.matchedJobs.length}`,
    );
    result.matchedJobs.forEach((job) => {
      console.log(`  ✓ ${job.title} — ${job.location}`);
      console.log(`    ${job.absoluteUrl}`);
    });
  }

  // Summary
  console.log("\n\n══ Summary ══════════════════════════════════════");
  const totalMatched = results.reduce((n, r) => n + r.matchedJobs.length, 0);
  const errors = results.filter((r) => r.error);
  console.log(`Matched jobs: ${totalMatched}`);
  console.log(
    `Scraped OK:   ${results.length - errors.length}/${results.length} companies`,
  );
  if (errors.length) {
    console.log(`\nNot yet supported:`);
    errors.forEach((r) => console.log(`  • ${r.companyName}: ${r.error}`));
  }

  // TODO: feed matchedJobs + resume into resume mutation pipeline
}

main().catch(console.error);
