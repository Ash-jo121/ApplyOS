import axios from "axios";
import { AtsType, DetectedAts } from "../types/Scraper";

// ─── URL pattern rules ────────────────────────────────────────────────────────

interface UrlRule {
  atsType: AtsType;
  pattern: RegExp;
  extractToken: (match: RegExpMatchArray, url: string) => string;
}

const URL_RULES: UrlRule[] = [
  {
    atsType: "greenhouse",
    pattern: /greenhouse\.io\/([^\/\?#]+)/i,
    extractToken: (m) => m[1],
  },
  {
    atsType: "lever",
    pattern: /jobs\.lever\.co\/([^\/\?#]+)/i,
    extractToken: (m) => m[1],
  },
  {
    atsType: "lever",
    // Razorpay and some others embed Lever under their own domain
    // We detect these via DOM fingerprint below
    pattern: /lever\.co\/([^\/\?#]+)/i,
    extractToken: (m) => m[1],
  },
  {
    atsType: "workday",
    // e.g. atlassian.wd1.myworkdayjobs.com
    pattern: /([^.]+)\.wd\d+\.myworkdayjobs\.com/i,
    extractToken: (m) => m[1],
  },
];

// ─── DOM fingerprints (for custom career pages that embed an ATS) ─────────────

interface DomFingerprint {
  atsType: AtsType;
  // Strings to look for in the raw HTML of the page
  signals: string[];
  // How to extract the company token from the matched URL/HTML
  extractToken: (html: string, url: string) => string | null;
}

const DOM_FINGERPRINTS: DomFingerprint[] = [
  {
    atsType: "greenhouse",
    signals: ["greenhouse.io", "boards.greenhouse.io", "grnh.se"],
    extractToken: (html) => {
      const match = html.match(/greenhouse\.io\/([a-z0-9_-]+)/i);
      return match?.[1] || null;
    },
  },
  {
    atsType: "lever",
    signals: ["jobs.lever.co", "lever.co/apply"],
    extractToken: (html) => {
      const match = html.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
      return match?.[1] || null;
    },
  },
  {
    atsType: "workday",
    signals: ["myworkdayjobs.com", "workday.com/en-US/index.html"],
    extractToken: (html, url) => {
      const match = html.match(/([a-z0-9_-]+)\.wd\d+\.myworkdayjobs\.com/i);
      return match?.[1] || null;
    },
  },
];

// ─── Main detector ────────────────────────────────────────────────────────────

export async function detectAts(url: string): Promise<DetectedAts | null> {
  // 1. Fast path: URL pattern match
  const fromUrl = detectFromUrl(url);
  if (fromUrl) {
    console.log(
      `[ATS Detector] URL match → ${fromUrl.atsType} ("${fromUrl.companyToken}")`,
    );
    return fromUrl;
  }

  // 2. Slow path: fetch page and fingerprint DOM
  console.log(`[ATS Detector] No URL match, fetching DOM for: ${url}`);
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": "ApplyOS/1.0" },
      timeout: 15000,
    });
    const html: string = response.data?.toString() || "";
    const fromDom = detectFromDom(html, url);
    if (fromDom) {
      console.log(
        `[ATS Detector] DOM fingerprint → ${fromDom.atsType} ("${fromDom.companyToken}")`,
      );
      return fromDom;
    }
  } catch (err: any) {
    console.warn(`[ATS Detector] DOM fetch failed for ${url}: ${err.message}`);
  }

  // 3. Unknown — fall back to generic scraper
  console.log(`[ATS Detector] Unknown ATS, falling back to generic`);
  return {
    atsType: "generic",
    companyToken: extractDomainAsToken(url),
    normalizedUrl: url,
  };
}

function detectFromUrl(url: string): DetectedAts | null {
  for (const rule of URL_RULES) {
    const match = url.match(rule.pattern);
    if (match) {
      return {
        atsType: rule.atsType,
        companyToken: rule.extractToken(match, url),
        normalizedUrl: url,
      };
    }
  }
  return null;
}

function detectFromDom(html: string, originalUrl: string): DetectedAts | null {
  for (const fingerprint of DOM_FINGERPRINTS) {
    const hit = fingerprint.signals.some((signal) => html.includes(signal));
    if (hit) {
      const token = fingerprint.extractToken(html, originalUrl);
      if (token) {
        return {
          atsType: fingerprint.atsType,
          companyToken: token,
          normalizedUrl: originalUrl,
        };
      }
    }
  }
  return null;
}

function extractDomainAsToken(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return "unknown";
  }
}
