export interface NormalizedJob {
  // Identity
  externalId: string;
  companyToken: string;
  source: AtsType;

  // Content
  title: string;
  location: string;
  departments: string[];
  content: string; // Plain text, HTML stripped

  // URLs
  absoluteUrl: string;
  applyUrl: string;

  // Dates
  updatedAt: string | null;
  scrapedAt: string;
}

export type AtsType = "greenhouse" | "lever" | "workday" | "generic";

export interface IScraper {
  readonly atsType: AtsType;
  readonly companyToken: string;

  fetchJobs(): Promise<NormalizedJob[]>;
  fetchJobDetails(jobId: string): Promise<NormalizedJob>;
  filterByKeywords(jobs: NormalizedJob[], keywords: string[]): NormalizedJob[];
}

export interface DetectedAts {
  atsType: AtsType;
  companyToken: string;
  normalizedUrl: string;
}
