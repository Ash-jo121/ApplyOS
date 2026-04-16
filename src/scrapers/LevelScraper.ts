import axios from "axios";
import { BaseScraper } from "./BaseScraper";
import { AtsType, NormalizedJob } from "../types/Scraper";

// Lever public API: https://api.lever.co/v0/postings/{company}
// Returns all active job postings. No auth required.

export class LeverScraper extends BaseScraper {
  readonly atsType: AtsType = "lever";
  readonly companyToken: string;

  private readonly baseUrl = "https://api.lever.co/v0/postings";

  constructor(companyToken: string) {
    super();
    this.companyToken = companyToken;
  }

  async fetchJobs(): Promise<NormalizedJob[]> {
    const url = `${this.baseUrl}/${this.companyToken}`;
    console.log(`[Lever] Fetching: ${url}`);

    const response = await axios.get(url, {
      params: { mode: "json" },
      headers: { "User-Agent": "ApplyOS/1.0" },
      timeout: 15000,
    });

    const jobs: any[] = response.data || [];
    console.log(`[Lever] ✓ ${jobs.length} jobs for "${this.companyToken}"`);
    return jobs.map((job) => this.normalize(job));
  }

  async fetchJobDetails(jobId: string): Promise<NormalizedJob> {
    const url = `${this.baseUrl}/${this.companyToken}/${jobId}`;
    const response = await axios.get(url, {
      params: { mode: "json" },
      timeout: 10000,
    });
    return this.normalize(response.data);
  }

  private normalize(job: any): NormalizedJob {
    // Lever's content is split into sections: description, lists, closing
    const contentParts: string[] = [];

    if (job.descriptionPlain) contentParts.push(job.descriptionPlain);

    if (job.lists?.length) {
      for (const list of job.lists) {
        if (list.text) contentParts.push(list.text);
        if (list.content) contentParts.push(this.stripHtml(list.content));
      }
    }

    if (job.additionalPlain) contentParts.push(job.additionalPlain);

    return {
      externalId: job.id,
      companyToken: this.companyToken,
      source: this.atsType,
      title: job.text,
      location: job.categories?.location || job.workplaceType || "Remote",
      departments: job.categories?.team ? [job.categories.team] : [],
      content: contentParts.join("\n").trim(),
      absoluteUrl: job.hostedUrl,
      applyUrl: job.applyUrl,
      updatedAt: job.updatedAt ? new Date(job.updatedAt).toISOString() : null,
      scrapedAt: this.now(),
    };
  }
}
