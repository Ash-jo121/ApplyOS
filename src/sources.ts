import * as cheerio from "cheerio";
import type {
  Company,
  GreenhouseCompany,
  HtmlCompany,
  Job,
  LeverCompany,
  OracleCompany,
  WorkdayCompany,
} from "./types.js";
import { absoluteUrl, idFromUrl, stableId, stripHtml } from "./lib/text.js";

const USER_AGENT = "ApplyOS-Job-Radar/2.0 (+https://github.com/Ash-jo121/ApplyOS)";
const SEARCH_TERMS = ["frontend", "front end", "react", "angular", "ui engineer", "full stack"];
const INDIA_LOCATION = /india|bengaluru|bangalore|hyderabad|pune|chennai|noida|gurugram|gurgaon|mumbai|remote/i;
const RELEVANT_TITLE = /front[ -]?end|full[ -]?stack|\bui\b|\bweb\b|software (?:development )?engineer|software developer/i;

async function request(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
          "User-Agent": USER_AGENT,
          ...init.headers,
        },
        signal: AbortSignal.timeout(25_000),
      });
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      lastError = new Error(`HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 350));
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`);
}

function now(): string {
  return new Date().toISOString();
}

function titleFromJobUrl(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const slug = segments.at(-1)?.match(/^R-\d+$/i) ? segments.at(-2) : segments.at(-1);
    return decodeURIComponent(slug ?? "").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return "";
  }
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function fetchCompanyJobs(company: Company): Promise<Job[]> {
  switch (company.source) {
    case "greenhouse":
      return fetchGreenhouse(company);
    case "lever":
      return fetchLever(company);
    case "workday":
      return fetchWorkday(company);
    case "oracle":
      return fetchOracle(company);
    case "html":
      return fetchHtml(company);
  }
}

async function fetchGreenhouse(company: GreenhouseCompany): Promise<Job[]> {
  const response = await request(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.token)}/jobs?content=true`,
  );
  const data = (await response.json()) as { jobs?: Array<Record<string, any>> };
  return (data.jobs ?? []).map((job) => ({
    id: stableId(company.id, String(job.id)),
    companyId: company.id,
    company: company.name,
    source: company.source,
    title: job.title ?? "",
    location: job.location?.name ?? "",
    description: stripHtml(job.content ?? ""),
    url: job.absolute_url ?? company.careerUrl,
    postedAt: job.updated_at ?? null,
    scrapedAt: now(),
  }));
}

async function fetchLever(company: LeverCompany): Promise<Job[]> {
  const response = await request(
    `https://api.lever.co/v0/postings/${encodeURIComponent(company.token)}?mode=json`,
  );
  const data = (await response.json()) as Array<Record<string, any>>;
  return data.map((job) => {
    const sections = (job.lists ?? [])
      .flatMap((list: any) => [list.text, stripHtml(list.content ?? "")])
      .filter(Boolean);
    return {
      id: stableId(company.id, String(job.id)),
      companyId: company.id,
      company: company.name,
      source: company.source,
      title: job.text ?? "",
      location: job.categories?.location ?? job.workplaceType ?? "",
      description: [job.descriptionPlain, ...sections, job.additionalPlain].filter(Boolean).join(" "),
      url: job.hostedUrl ?? job.applyUrl ?? company.careerUrl,
      postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
      scrapedAt: now(),
    } satisfies Job;
  });
}

interface WorkdayPosting {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

async function fetchWorkday(company: WorkdayCompany): Promise<Job[]> {
  const endpoint = `${company.host}/wday/cxs/${company.tenant}/${company.site}/jobs`;
  const postings = new Map<string, WorkdayPosting>();
  const terms = company.searchText ? [company.searchText] : SEARCH_TERMS;

  for (const searchText of terms) {
    let offset = 0;
    let total = 0;
    do {
      const response = await request(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Official Workday endpoint is unavailable or in maintenance");
      }
      const data = (await response.json()) as { total?: number; jobPostings?: WorkdayPosting[] };
      total = Math.min(data.total ?? 0, 120);
      for (const posting of data.jobPostings ?? []) postings.set(posting.externalPath, posting);
      offset += 20;
    } while (offset < total);
  }

  const candidates = [...postings.values()]
    .filter((posting) => RELEVANT_TITLE.test(posting.title))
    .filter((posting) => !posting.locationsText || INDIA_LOCATION.test(posting.locationsText))
    .slice(0, 80);

  const jobs = await mapLimit(candidates, 6, async (posting): Promise<Job> => {
    const detailUrl = `${company.host}/wday/cxs/${company.tenant}/${company.site}${posting.externalPath}`;
    let description = "";
    let location = posting.locationsText ?? "";
    let postedAt: string | null = posting.postedOn ?? null;
    try {
      const detail = (await (await request(detailUrl, {}, 1)).json()) as Record<string, any>;
      const info = detail.jobPostingInfo ?? detail;
      description = stripHtml(info.jobDescription ?? "");
      location = info.location ?? info.additionalLocations?.join(", ") ?? location;
      postedAt = info.startDate ?? info.postedOn ?? postedAt;
    } catch {
      // A list result is still useful if a detail endpoint briefly fails.
    }
    const sourceId = posting.bulletFields?.[0] ?? posting.externalPath;
    return {
      id: stableId(company.id, sourceId),
      companyId: company.id,
      company: company.name,
      source: company.source,
      title: posting.title,
      location,
      description,
      url: `${company.host}/en-US/${company.site}${posting.externalPath}`,
      postedAt,
      scrapedAt: now(),
    };
  });
  return jobs;
}

async function fetchOracle(company: OracleCompany): Promise<Job[]> {
  const found = new Map<string, Job>();
  for (const keyword of SEARCH_TERMS) {
    let offset = 0;
    let total = 0;
    do {
      const finder = [
        `siteNumber=${company.siteNumber}`,
        `keyword=${encodeURIComponent(keyword)}`,
        "limit=25",
        `offset=${offset}`,
      ].join(",");
      const url = `${company.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;${finder}`;
      const response = await request(url, { headers: { "REST-Framework-Version": "4" } });
      const data = (await response.json()) as { items?: Array<Record<string, any>> };
      const root = data.items?.[0];
      total = Math.min(root?.TotalJobsCount ?? 0, 150);
      for (const item of root?.requisitionList?.items ?? []) {
        const id = String(item.Id);
        found.set(id, {
          id: stableId(company.id, id),
          companyId: company.id,
          company: company.name,
          source: company.source,
          title: item.Title ?? "",
          location: item.PrimaryLocation ?? item.PrimaryLocationCountry ?? "",
          description: stripHtml(
            [item.ShortDescriptionStr, item.ExternalResponsibilitiesStr, item.ExternalQualificationsStr]
              .filter(Boolean)
              .join(" "),
          ),
          url: `${company.host}/hcmUI/CandidateExperience/en/sites/${company.siteNumber}/job/${id}`,
          postedAt: item.PostedDate ?? null,
          scrapedAt: now(),
        });
      }
      offset += 25;
    } while (offset < total);
  }
  const candidates = [...found.values()]
    .filter((job) => INDIA_LOCATION.test(job.location))
    .filter((job) => RELEVANT_TITLE.test(job.title))
    .slice(0, 80);

  return mapLimit(candidates, 6, async (job) => {
    const sourceId = job.id.slice(job.id.indexOf(":") + 1);
    try {
      const detailUrl = `${company.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails/${sourceId}?onlyData=true`;
      const detail = (await (
        await request(detailUrl, { headers: { "REST-Framework-Version": "4" } }, 1)
      ).json()) as Record<string, any>;
      return {
        ...job,
        title: detail.Title ?? job.title,
        location: detail.PrimaryLocation ?? job.location,
        description: stripHtml(
          [
            detail.ExternalDescriptionStr,
            detail.ExternalResponsibilitiesStr,
            detail.ExternalQualificationsStr,
            detail.ShortDescriptionStr,
          ]
            .filter(Boolean)
            .join(" "),
        ),
        postedAt: detail.ExternalPostedStartDate ?? job.postedAt,
      };
    } catch {
      return job;
    }
  });
}

interface JsonLdJobPosting {
  "@type"?: string;
  title?: string;
  description?: string;
  datePosted?: string;
  url?: string;
  jobLocation?: any;
}

function findJsonLdJob($: cheerio.CheerioAPI): JsonLdJobPosting | null {
  for (const node of $("script[type='application/ld+json']").toArray()) {
    try {
      const value = JSON.parse($(node).text());
      const candidates = Array.isArray(value) ? value : value?.["@graph"] ?? [value];
      const job = candidates.find((item: JsonLdJobPosting) => item?.["@type"] === "JobPosting");
      if (job) return job;
    } catch {
      // Ignore unrelated or malformed structured data.
    }
  }
  return null;
}

function jsonLdLocation(job: JsonLdJobPosting): string {
  const locations = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation];
  return locations
    .map((entry) => {
      const address = entry?.address ?? entry;
      return [address?.addressLocality, address?.addressRegion, address?.addressCountry]
        .filter(Boolean)
        .join(", ");
    })
    .filter(Boolean)
    .join("; ");
}

async function fetchHtml(company: HtmlCompany): Promise<Job[]> {
  const candidates = new Map<string, { url: string; title: string }>();
  const pattern = new RegExp(company.jobLinkPattern, "i");
  let successfulLists = 0;
  let lastError: unknown;

  for (const listUrl of company.listUrls) {
    try {
      const response = await request(listUrl);
      const html = await response.text();
      const $ = cheerio.load(html);
      successfulLists += 1;
      $("a[href]").each((_, element) => {
        const href = $(element).attr("href");
        if (!href) return;
        const url = absoluteUrl(response.url || listUrl, href);
        if (!url || !pattern.test(url)) return;
        const title = stripHtml(
          $(element).attr("aria-label") ??
            $(element).attr("title") ??
            $(element).text() ??
            "",
        ).replace(/^(apply(?: now)?|view job)\s*/i, "");
        candidates.set(url, { url, title });
      });
      $("loc").each((_, element) => {
        const rawUrl = $(element).text().trim();
        const url = absoluteUrl(response.url || listUrl, rawUrl);
        if (!url || !pattern.test(url)) return;
        const title = titleFromJobUrl(url);
        if (RELEVANT_TITLE.test(title)) candidates.set(url, { url, title });
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (successfulLists === 0) throw lastError instanceof Error ? lastError : new Error("No list page was reachable");
  if (candidates.size === 0 && !company.emptyIsHealthy) {
    throw new Error("Career page loaded but no job links matched; the page structure may have changed");
  }

  const detailCandidates = [...candidates.values()]
    .sort((a, b) => Number(RELEVANT_TITLE.test(b.title)) - Number(RELEVANT_TITLE.test(a.title)))
    .slice(0, 100);
  const jobs = await mapLimit(detailCandidates, 6, async (candidate): Promise<Job | null> => {
    try {
      const response = await request(candidate.url, {}, 2);
      const html = await response.text();
      const $ = cheerio.load(html);
      const structured = findJsonLdJob($);
      const title = stripHtml(
        structured?.title ?? candidate.title ?? $("h1").first().text() ?? $("title").text(),
      );
      const description = stripHtml(
        structured?.description ??
          $("[class*='job-description'], [class*='jobDescription'], [data-automation-id='jobPostingDescription']")
            .first()
            .html() ??
          $("main").text() ??
          $("body").text(),
      );
      const location = stripHtml(
        jsonLdLocation(structured ?? {}) ||
          $("[class*='location'], [data-automation-id='locations']").first().text() ||
          description.match(/(?:location|based at|based in)\s*:?\s*([^|.\n]{2,80})/i)?.[1] ||
          "",
      );
      const finalUrl = structured?.url ? absoluteUrl(candidate.url, structured.url) ?? candidate.url : candidate.url;
      return {
        id: stableId(company.id, idFromUrl(finalUrl)),
        companyId: company.id,
        company: company.name,
        source: company.source,
        title,
        location,
        description,
        url: finalUrl,
        postedAt: structured?.datePosted ?? null,
        scrapedAt: now(),
      };
    } catch {
      if (candidate.title) {
        return {
          id: stableId(company.id, idFromUrl(candidate.url)),
          companyId: company.id,
          company: company.name,
          source: company.source,
          title: candidate.title,
          location: "",
          description: "",
          url: candidate.url,
          postedAt: null,
          scrapedAt: now(),
        };
      }
      return null;
    }
  });
  return jobs.filter((job): job is Job => job !== null);
}
