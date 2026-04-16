import axios from "axios";
import { BaseScraper } from "./BaseScraper";
import { AtsType, NormalizedJob } from "../types/Scraper";

// MyNextHire — Indian ATS, confirmed via DevTools on careers.swiggy.com
//
// Payload (exact, 3 fields only):
//   POST /employer/careers/reqlist/get
//   { source: "careers", code: "", filterByBuId: -1 }
//
// Response shape:
//   { reqDetailsBOList: [ { reqId, statusId, buName, reqTitle, expMin, expMax, ... } ] }
//
// Job URL pattern (reverse-engineered from Swiggy job page):
//   https://careers.{company}.com/#/careers?p=base64({"pageType":"jd","cvSource":"careers","reqId":N,...})
//
// Note: The API returns ALL jobs in a single response — no pagination needed.

interface MyNextHireJob {
  reqId: number;
  reqTitle: string;
  buName: string; // department / business unit
  statusId: number;
  expMin?: number;
  expMax?: number;
  cityName?: string;
  stateName?: string;
  workLocation?: string;
  updatedDate?: string;
  [key: string]: any; // allow extra fields we haven't mapped yet
}

export class MyNextHireScraper extends BaseScraper {
  readonly atsType: AtsType = "mynexthire";
  readonly companyToken: string; // e.g. "swiggy"
  readonly companyName: string;

  // The careers page lives at careers.{company}.com, not {company}.mynexthire.com
  // The API lives at {company}.mynexthire.com
  private get apiBase() {
    return `https://${this.companyToken}.mynexthire.com`;
  }

  private get careersBase() {
    return `https://careers.${this.companyToken}.com`;
  }

  constructor(companyToken: string, companyName: string) {
    super();
    this.companyToken = companyToken;
    this.companyName = companyName;
  }

  async fetchJobs(): Promise<NormalizedJob[]> {
    const url = `${this.apiBase}/employer/careers/reqlist/get`;
    console.log(`[MyNextHire] Fetching: ${url}`);

    const response = await axios.post(
      url,
      // Exact payload from DevTools — 3 fields, nothing more
      { source: "careers", code: "", filterByBuId: -1 },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          Origin: this.careersBase,
          Referer: `${this.careersBase}/`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0.0.0 Safari/537.36",
        },
        timeout: 15000,
      },
    );

    // Exact response field from DevTools
    const jobs: MyNextHireJob[] = response.data?.reqDetailsBOList ?? [];
    console.log(`[MyNextHire] ✓ ${jobs.length} jobs for "${this.companyName}"`);

    return jobs.map((job) => this.normalize(job));
  }

  async fetchJobDetails(jobId: string): Promise<NormalizedJob> {
    // MyNextHire doesn't have a separate details endpoint in the public API.
    // The job page is a client-side render using the same reqlist data.
    // For now, throw — full detail fetching can be added if needed later.
    throw new Error(
      `[MyNextHire] fetchJobDetails not implemented — use fetchJobs() and filter by externalId`,
    );
  }

  private buildJobUrl(job: MyNextHireJob): string {
    // Reconstruct the URL using the exact base64 pattern seen in the job page URL
    const payload = {
      pageType: "jd",
      cvSource: "careers",
      reqId: job.reqId,
      requester: { id: "", code: "", name: "" },
      page: "careers",
      bufilter: -1,
      customFields: job.buName ? { career_page_category: job.buName } : {},
    };
    const p = Buffer.from(JSON.stringify(payload)).toString("base64");
    return `${this.careersBase}/#/careers?p=${p}`;
  }

  private normalize(job: MyNextHireJob): NormalizedJob {
    // Field names confirmed from DevTools preview:
    // reqId, reqTitle, buName, statusId, expMin, expMax
    // Location fields (cityName/stateName/workLocation) — expand once a job is clicked
    const location =
      job.cityName ?? job.stateName ?? job.workLocation ?? "India";

    return {
      externalId: job.reqId.toString(),
      companyToken: this.companyToken,
      companyName: this.companyName,
      source: this.atsType,
      title: job.reqTitle,
      location,
      departments: job.buName ? [job.buName] : [],
      // Full description not available in list API — would need a detail call
      content: [
        job.buName ? `Department: ${job.buName}` : "",
        job.expMin != null
          ? `Experience: ${job.expMin}${job.expMax != null ? `–${job.expMax}` : "+"} years`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      absoluteUrl: this.buildJobUrl(job),
      applyUrl: this.buildJobUrl(job),
      updatedAt: job.updatedDate ?? null,
      scrapedAt: this.now(),
    };
  }
}
