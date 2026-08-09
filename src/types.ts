export type SourceKind = "greenhouse" | "lever" | "workday" | "oracle" | "html";

export interface Job {
  id: string;
  companyId: string;
  company: string;
  source: SourceKind;
  title: string;
  location: string;
  description: string;
  url: string;
  postedAt: string | null;
  scrapedAt: string;
}

export interface Match extends Job {
  score: number;
  reasons: string[];
  experience: { min: number | null; max: number | null };
  firstSeenAt: string;
  isNew: boolean;
}

interface CompanyBase {
  id: string;
  name: string;
  careerUrl: string;
  enabled: boolean;
}

export interface GreenhouseCompany extends CompanyBase {
  source: "greenhouse";
  token: string;
}

export interface LeverCompany extends CompanyBase {
  source: "lever";
  token: string;
}

export interface WorkdayCompany extends CompanyBase {
  source: "workday";
  host: string;
  tenant: string;
  site: string;
  searchText?: string;
}

export interface OracleCompany extends CompanyBase {
  source: "oracle";
  host: string;
  siteNumber: string;
}

export interface HtmlCompany extends CompanyBase {
  source: "html";
  listUrls: string[];
  jobLinkPattern: string;
  emptyIsHealthy?: boolean;
}

export type Company =
  | GreenhouseCompany
  | LeverCompany
  | WorkdayCompany
  | OracleCompany
  | HtmlCompany;

export interface CompanyStatus {
  companyId: string;
  company: string;
  source: SourceKind;
  state: "healthy" | "degraded";
  jobsFound: number;
  matchesFound: number;
  checkedAt: string;
  durationMs: number;
  error?: string;
}

export interface DashboardData {
  generatedAt: string;
  scheduleHours: number;
  matches: Match[];
  statuses: CompanyStatus[];
  notifications: {
    emailConfigured: boolean;
    whatsappConfigured: boolean;
    newMatches: number;
  };
}
