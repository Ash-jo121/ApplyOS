import axios from "axios";

export class GreenhouseScraper {
  companyToken: string;
  baseUrl: string;

  constructor(companyToken) {
    this.companyToken = companyToken;
    // Job Board API is always at boards-api.greenhouse.io for both US and EU.
    // api.eu.greenhouse.io is the dashboard (login), not the public jobs API.
    this.baseUrl = "https://boards-api.greenhouse.io/v1/boards";
  }

  async fetchJobs(filters = {}) {
    try {
      const url = `${this.baseUrl}/${this.companyToken}/jobs`;
      console.log(`Fetching jobs from: ${url}`);

      const response = await axios.get(url, {
        params: {
          content: "true", // Include full job description
          ...filters,
        },
        headers: {
          "User-Agent": "JobScraper/1.0",
        },
        timeout: 15000,
      });

      const jobs = response.data.jobs || [];
      console.log(`✓ Found ${jobs.length} jobs for ${this.companyToken}`);

      return jobs.map((job) => this.normalizeJob(job));
    } catch (error) {
      console.error(
        `✗ Error fetching jobs for ${this.companyToken}:`,
        error.message,
      );

      // Handle specific errors
      if (error.response?.status === 404) {
        throw new Error(
          `Company token "${this.companyToken}" not found in Greenhouse`,
        );
      }

      throw error;
    }
  }

  async fetchJobDetails(jobId) {
    try {
      const url = `${this.baseUrl}/${this.companyToken}/jobs/${jobId}`;
      const response = await axios.get(url, {
        params: { questions: "true" }, // Include application questions
        timeout: 10000,
      });

      return this.normalizeJob(response.data);
    } catch (error) {
      console.error(`Error fetching job ${jobId}:`, error.message);
      throw error;
    }
  }

  normalizeJob(job) {
    return {
      // Core identifiers
      externalId: job.id?.toString(),
      title: job.title,

      // URLs
      absoluteUrl: job.absolute_url,
      applyUrl: job.absolute_url, // Same for Greenhouse

      // Location
      location: job.location?.name || "Remote",

      // Metadata
      departments: job.departments?.map((d) => d.name) || [],
      offices: job.offices?.map((o) => o.name) || [],

      // Description & Content
      content: job.content || "",
      htmlContent: job.content || "", // Greenhouse returns HTML

      // Dates
      updatedAt: job.updated_at,

      // Additional info
      metadata: job.metadata || [],
      questions: job.questions || [],

      // For tracking
      scrapedAt: new Date().toISOString(),
      source: "greenhouse",
      companyToken: this.companyToken,
    };
  }

  filterByKeywords(jobs, keywords) {
    if (!keywords || keywords.length === 0) return jobs;

    // Escape special regex characters in keywords and create case-insensitive regex
    const escapedKeywords = keywords
      .map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const keywordRegex = new RegExp(`\\b(${escapedKeywords})\\b`, "i");

    return jobs.filter((job) => {
      // Decode HTML entities and strip HTML tags from content
      const decodeHtml = (html) => {
        if (!html) return "";
        return html
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/<[^>]*>/g, " ") // Strip HTML tags
          .replace(/\s+/g, " ") // Normalize whitespace
          .trim();
      };

      const cleanContent = decodeHtml(job.content || "");
      const departmentsText = (job.departments || []).join(" ");
      const searchText = `${job.title || ""} ${cleanContent} ${departmentsText}`.toLowerCase();

      return keywordRegex.test(searchText);
    });
  }
}

async function exampleUsage() {
  console.log("=== Greenhouse Scraper Example ===\n");

  // Example 1: Groww (EU region)
  const growwScraper = new GreenhouseScraper("groww");

  try {
    // Fetch all jobs
    const jobs = await growwScraper.fetchJobs();
    console.log(`\nTotal jobs at Groww: ${jobs.length}`);

    // Show first job
    if (jobs.length > 0) {
      console.log("\nFirst job example:");
      console.log(JSON.stringify(jobs[0], null, 2));
    }

    // Filter by keywords (e.g., frontend, React, UI)
    const keywords = ["frontend", "react", "ui", "engineer"];
    const filteredJobs = growwScraper.filterByKeywords(jobs, keywords);
    console.log(
      `\nJobs matching keywords [${keywords.join(", ")}]: ${filteredJobs.length}`,
    );

    filteredJobs.forEach((job) => {
      console.log(`  - ${job.title} (${job.location})`);
      console.log(`    ${job.absoluteUrl}`);
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

export function parseGreenhouseUrl(url) {
  // Patterns:
  // https://boards.greenhouse.io/groww
  // https://job-boards.greenhouse.io/groww
  // https://job-boards.eu.greenhouse.io/groww
  // https://boards.greenhouse.io/groww/jobs/123456

  const patterns = [
    /greenhouse\.io\/([^\/\?]+)/i,
    /boards\.greenhouse\.io\/([^\/\?]+)/i,
    /job-boards\.greenhouse\.io\/([^\/\?]+)/i,
    /job-boards\.eu\.greenhouse\.io\/([^\/\?]+)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const region = url.includes(".eu.greenhouse.io") ? "eu" : "us";
      return {
        companyToken: match[1],
        region,
      };
    }
  }

  return null;
}

export function createScraperFromUrl(url) {
  const parsed = parseGreenhouseUrl(url);
  if (!parsed) {
    throw new Error(`Could not parse Greenhouse URL: ${url}`);
  }

  console.log(`Detected: company="${parsed.companyToken}"`);
  return new GreenhouseScraper(parsed.companyToken);
}

if (require.main === module) {
  exampleUsage();
}
