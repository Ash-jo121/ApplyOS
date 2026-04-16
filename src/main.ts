import { ScraperFactory } from "./core/ScraperFactory";

const TARGET_COMPANIES = [
  {
    companyName: "Groww",
    companyCareersPage: "https://job-boards.eu.greenhouse.io/groww",
    keywords: ["frontend", "ui", "React", "Angular"],
  },
  {
    companyName: "Razorpay",
    companyCareersPage: "https://razorpay.com/jobs/",
    keywords: ["frontend", "React", "ui engineer"],
  },
];

async function scrapeCompany(company: (typeof TARGET_COMPANIES)[0]) {
  console.log(`\n── ${company.companyName} ──────────────────────`);
  const scraper = await ScraperFactory.fromUrl(company.companyCareersPage);
  const jobs = await scraper.fetchJobs();
  const matched = scraper.filterByKeywords(jobs, company.keywords);

  console.log(`Total: ${jobs.length} | Matched: ${matched.length}`);
  matched.forEach((j) =>
    console.log(`  ✓ ${j.title} — ${j.location}\n    ${j.absoluteUrl}`)
  );

  return { company: company.companyName, jobs, matched };
}

async function main() {
  console.log("ApplyOS booting...\n");

  for (const company of TARGET_COMPANIES) {
    try {
      await scrapeCompany(company);
    } catch (err: any) {
      console.error(`✗ ${company.companyName}: ${err.message}`);
    }
  }
}

main().catch(console.error);