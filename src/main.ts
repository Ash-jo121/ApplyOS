import { createScraperFromUrl } from "./scrapers/greenhouse-scraper";

async function scrapeCompany(companyToBeScraped) {
  const scraper = createScraperFromUrl(companyToBeScraped.companyCareersPage);
  const jobList = await scraper.fetchJobs();

  if (jobList.length === 0) {
    return { jobs: [], matchedJobs: [], totalMatchedJobs: 0, totalJobs: 0 };
  }

  const filterdJobs = scraper.filterByKeywords(
    jobList,
    companyToBeScraped.keywords,
  );
  return {
    jobs: jobList,
    matchedJobs: filterdJobs,
    totalMatchedJobs: filterdJobs.length,
    totalJobs: jobList.length,
  };
}

async function main() {
  console.log("ApplyOS booting...");
  console.log("Loading target companies...");
  console.log("Starting job scraping...");

  const companyToBeScraped = {
    companyName: "Groww",
    companyCareersPage: "https://job-boards.eu.greenhouse.io/groww",
    ats: "greenhouse",
    keywords: ["frontend", "ui", "React", "Angular"],
  };

  const scrapedData = await scrapeCompany(companyToBeScraped);
  //console.log(scrapedData);
}

if (require.main === module) {
  main().catch(console.error);
}
