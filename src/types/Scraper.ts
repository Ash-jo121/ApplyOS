// ─── ATS / Scraper types ──────────────────────────────────────────────────────

export type AtsType =
  | "greenhouse"
  | "lever"
  | "workday"
  | "mynexthire"
  | "generic";

export interface NormalizedJob {
  externalId: string;
  companyToken: string;
  companyName: string;
  source: AtsType;

  title: string;
  location: string;
  departments: string[];
  content: string; // plain text, HTML stripped

  absoluteUrl: string;
  applyUrl: string;

  updatedAt: string | null;
  scrapedAt: string;
}

export interface DetectedAts {
  atsType: AtsType;
  companyToken: string;
  normalizedUrl: string;
}

export interface IScraper {
  readonly atsType: AtsType;
  readonly companyToken: string;
  fetchJobs(): Promise<NormalizedJob[]>;
  fetchJobDetails(jobId: string): Promise<NormalizedJob>;
}

// ─── User config ──────────────────────────────────────────────────────────────

export interface TargetCompany {
  companyName: string;
  companyCareersPage: string;
}

// Keywords are global — set once, applied across every company
export interface ScrapeConfig {
  keywords: string[];
  companies: TargetCompany[];
}

export interface ScrapeResult {
  companyName: string;
  totalJobs: number;
  matchedJobs: NormalizedJob[];
  error?: string;
}

// ─── Resume ───────────────────────────────────────────────────────────────────

export interface ResumeSkills {
  languages: string[];
  frameworks: string[];
  tools: string[];
}

export interface ResumeExperience {
  company: string;
  role: string;
  duration: string;
  bullets: string[];
}

export interface ResumeProject {
  name: string;
  "tech-stack": string[];
  "website-link": string;
  bullets: string[];
}

export interface ResumeEducation {
  degree: string;
  institution: string;
  duration: string;
  bullets: string[];
  gpa: string;
}

export interface Resume {
  summary: string;
  skills: ResumeSkills;
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
}
