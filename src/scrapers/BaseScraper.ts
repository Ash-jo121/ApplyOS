import { AtsType, IScraper, NormalizedJob } from "../types/Scraper";

export abstract class BaseScraper implements IScraper {
  abstract readonly atsType: AtsType;
  abstract readonly companyToken: string;

  abstract fetchJobs(): Promise<NormalizedJob[]>;
  abstract fetchJobDetails(jobId: string): Promise<NormalizedJob>;

  filterByKeywords(jobs: NormalizedJob[], keywords: string[]): NormalizedJob[] {
    if (!keywords || keywords.length === 0) return jobs;

    const escaped = keywords
      .map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const regex = new RegExp(`\\b(${escaped})\\b`, "i");

    return jobs.filter((job) => {
      const searchText = [
        job.title,
        job.content,
        ...job.departments,
        job.location,
      ].join(" ");
      return regex.test(searchText);
    });
  }

  // Shared HTML → plain text utility
  protected stripHtml(html: string): string {
    if (!html) return "";
    return html
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  protected now(): string {
    return new Date().toISOString();
  }
}
