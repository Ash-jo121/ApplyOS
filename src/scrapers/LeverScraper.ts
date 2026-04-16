import axios from "axios";
import { BaseScraper } from "./BaseScraper";
import { AtsType, NormalizedJob } from "../types/Scraper";

export class LeverScraper extends BaseScraper {
  readonly atsType: AtsType = "lever";
  readonly companyToken: string;
  readonly companyName: string;

  private readonly baseUrl = "https://api.lever.co/v0/postings";

  constructor(companyToken: string, companyName: string) {
    super();
    this.companyToken = companyToken;
    this.companyName = companyName;
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
    console.log(`[Lever] ✓ ${jobs.length} jobs for "${this.companyName}"`);
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
    const contentParts: string[] = [];
    if (job.descriptionPlain) contentParts.push(job.descriptionPlain);
    for (const list of job.lists || []) {
      if (list.text) contentParts.push(list.text);
      if (list.content) contentParts.push(this.stripHtml(list.content));
    }
    if (job.additionalPlain) contentParts.push(job.additionalPlain);

    return {
      externalId: job.id,
      companyToken: this.companyToken,
      companyName: this.companyName,
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
