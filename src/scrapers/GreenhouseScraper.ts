import axios from "axios";
import { BaseScraper } from "./BaseScraper";
import { AtsType, NormalizedJob } from "../types/Scraper";
export class GreenhouseScraper extends BaseScraper {
  readonly atsType: AtsType = "greenhouse";
  readonly companyToken: string;
  readonly companyName: string;

  private readonly baseUrl = "https://boards-api.greenhouse.io/v1/boards";

  constructor(companyToken: string, companyName: string) {
    super();
    this.companyToken = companyToken;
    this.companyName = companyName;
  }

  async fetchJobs(): Promise<NormalizedJob[]> {
    const url = `${this.baseUrl}/${this.companyToken}/jobs`;
    console.log(`[Greenhouse] Fetching: ${url}`);

    const response = await axios.get(url, {
      params: { content: "true" },
      headers: { "User-Agent": "ApplyOS/1.0" },
      timeout: 15000,
    });

    const jobs = response.data.jobs || [];
    console.log(`[Greenhouse] ✓ ${jobs.length} jobs for "${this.companyName}"`);
    return jobs.map((job: any) => this.normalize(job));
  }

  async fetchJobDetails(jobId: string): Promise<NormalizedJob> {
    const url = `${this.baseUrl}/${this.companyToken}/jobs/${jobId}`;
    const response = await axios.get(url, {
      params: { questions: "true" },
      timeout: 10000,
    });
    return this.normalize(response.data);
  }

  private normalize(job: any): NormalizedJob {
    return {
      externalId: job.id?.toString(),
      companyToken: this.companyToken,
      companyName: this.companyName,
      source: this.atsType,
      title: job.title,
      location: job.location?.name || "Remote",
      departments: job.departments?.map((d: any) => d.name) || [],
      content: this.stripHtml(job.content || ""),
      absoluteUrl: job.absolute_url,
      applyUrl: job.absolute_url,
      updatedAt: job.updated_at || null,
      scrapedAt: this.now(),
    };
  }
}
