import { GreenhouseScraper } from "../scrapers/GreenhouseScraper";
import { LeverScraper } from "../scrapers/LevelScraper";
import { IScraper } from "../types/Scraper";
import { detectAts } from "./AtsDetector";

export class ScraperFactory {
  // Create a scraper from a careers page URL.
  // Runs ATS detection automatically.
  static async fromUrl(url: string): Promise<IScraper> {
    const detected = await detectAts(url);

    if (!detected) {
      throw new Error(`Could not detect ATS for URL: ${url}`);
    }

    return ScraperFactory.fromDetected(detected.atsType, detected.companyToken);
  }

  // Create a scraper when you already know the ATS and token.
  static fromDetected(atsType: string, companyToken: string): IScraper {
    switch (atsType) {
      case "greenhouse":
        return new GreenhouseScraper(companyToken);
      case "lever":
        return new LeverScraper(companyToken);
      case "workday":
        // TODO: WorkdayScraper
        throw new Error(
          `Workday scraper not yet implemented for: ${companyToken}`,
        );
      case "generic":
        // TODO: GenericScraper (Playwright)
        throw new Error(
          `Generic scraper not yet implemented for: ${companyToken}`,
        );
      default:
        throw new Error(`Unknown ATS type: ${atsType}`);
    }
  }
}
