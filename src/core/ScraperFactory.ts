import { GreenhouseScraper } from "../scrapers/GreenhouseScraper";
import { LeverScraper } from "../scrapers/LeverScraper";
import { MyNextHireScraper } from "../scrapers/MyNextHireScraper";
import { IScraper, TargetCompany } from "../types/Scraper";
import { detectAts } from "./AtsDetector";

export class ScraperFactory {
  static async fromCompany(company: TargetCompany): Promise<IScraper> {
    const detected = await detectAts(
      company.companyCareersPage,
      company.companyName,
    );

    if (!detected) {
      throw new Error(`Could not detect ATS for: ${company.companyName}`);
    }

    switch (detected.atsType) {
      case "greenhouse":
        return new GreenhouseScraper(
          detected.companyToken,
          company.companyName,
        );
      case "lever":
        return new LeverScraper(detected.companyToken, company.companyName);
      case "mynexthire":
        return new MyNextHireScraper(
          detected.companyToken,
          company.companyName,
        );
      case "workday":
        throw new Error(
          `Workday scraper not yet implemented (${company.companyName}). ` +
            `This affects: Atlassian, PhonePe, Flipkart, Myntra.`,
        );
      case "generic":
        throw new Error(
          `Generic/headless scraper not yet implemented (${company.companyName}).`,
        );
      default:
        throw new Error(`Unknown ATS type: ${detected.atsType}`);
    }
  }
}
