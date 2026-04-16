import axios from "axios";
import { AtsType, DetectedAts } from "../types/Scraper";

// ─── URL pattern rules ────────────────────────────────────────────────────────

interface UrlRule {
  atsType: AtsType;
  pattern: RegExp;
  extractToken: (match: RegExpMatchArray) => string;
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
    atsType: "workday",
    pattern: /([^.]+)\.wd\d+\.myworkdayjobs\.com/i,
    extractToken: (m) => m[1],
  },
  {
    // e.g. swiggy.mynexthire.com → token = "swiggy"
    atsType: "mynexthire",
    pattern: /([^.]+)\.mynexthire\.com/i,
    extractToken: (m) => m[1],
  },
];

// ─── Known company overrides (researched) ────────────────────────────────────
// For companies whose careers page URL gives no ATS signal (custom domains).
// Saves a DOM fetch round-trip for known targets.

export const KNOWN_COMPANIES: Record<
  string,
  { atsType: AtsType; companyToken: string }
> = {
  // Greenhouse
  "job-boards.eu.greenhouse.io/groww": {
    atsType: "greenhouse",
    companyToken: "groww",
  },
  "razorpay.com": {
    atsType: "greenhouse",
    companyToken: "razorpaysoftwareprivatelimited",
  },

  // Lever
  "jobs.lever.co/meesho": { atsType: "lever", companyToken: "meesho" },
  "jobs.lever.co/cred": { atsType: "lever", companyToken: "cred" },
  "careers.cred.club": { atsType: "lever", companyToken: "cred" },
  "www.meesho.io": { atsType: "lever", companyToken: "meesho" },

  // MyNextHire — Swiggy confirmed via DevTools (POST swiggy.mynexthire.com/employer/careers/reqlist/get)
  "careers.swiggy.com": { atsType: "mynexthire", companyToken: "swiggy" },

  // Unsupported — no public API available
  // Ola: TurboHire (closed Indian ATS, no public job API)
};

// ─── DOM fingerprints (fallback when URL patterns don't match) ────────────────

interface DomFingerprint {
  atsType: AtsType;
  signals: string[];
  extractToken: (html: string) => string | null;
}

const DOM_FINGERPRINTS: DomFingerprint[] = [
  {
    atsType: "greenhouse",
    signals: ["boards.greenhouse.io", "boards-api.greenhouse.io", "grnh.se"],
    extractToken: (html) => {
      const m = html.match(/greenhouse\.io\/([a-z0-9_-]+)/i);
      return m?.[1] || null;
    },
  },
  {
    atsType: "lever",
    signals: ["jobs.lever.co", "lever.co/apply"],
    extractToken: (html) => {
      const m = html.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
      return m?.[1] || null;
    },
  },
  {
    atsType: "workday",
    signals: ["myworkdayjobs.com"],
    extractToken: (html) => {
      const m = html.match(/([a-z0-9_-]+)\.wd\d+\.myworkdayjobs\.com/i);
      return m?.[1] || null;
    },
  },
  {
    atsType: "mynexthire",
    signals: ["mynexthire.com"],
    extractToken: (html) => {
      const m = html.match(/([a-z0-9_-]+)\.mynexthire\.com/i);
      return m?.[1] || null;
    },
  },
];

// ─── Main detector ────────────────────────────────────────────────────────────

export async function detectAts(
  url: string,
  companyName: string,
): Promise<DetectedAts | null> {
  // 1. Known company lookup (fastest — no network)
  const known = lookupKnown(url);
  if (known) {
    console.log(
      `[ATS Detector] Known override → ${known.atsType} ("${known.companyToken}") for ${companyName}`,
    );
    return { ...known, normalizedUrl: url };
  }

  // 2. URL pattern match (fast, no network)
  const fromUrl = detectFromUrl(url);
  if (fromUrl) {
    console.log(
      `[ATS Detector] URL match → ${fromUrl.atsType} ("${fromUrl.companyToken}") for ${companyName}`,
    );
    return fromUrl;
  }

  // 3. DOM fingerprint (slow — one HTTP fetch)
  console.log(`[ATS Detector] Fetching DOM for ${companyName}: ${url}`);
  try {
    const response = await axios.get(url, {
      headers: { "User-Agent": "ApplyOS/1.0" },
      timeout: 15000,
    });
    const html: string = response.data?.toString() || "";
    const fromDom = detectFromDom(html);
    if (fromDom) {
      console.log(
        `[ATS Detector] DOM fingerprint → ${fromDom.atsType} ("${fromDom.companyToken}") for ${companyName}`,
      );
      return { ...fromDom, normalizedUrl: url };
    }
  } catch (err: any) {
    console.warn(`[ATS Detector] DOM fetch failed for ${url}: ${err.message}`);
  }

  // 4. Unknown — signal generic scraper needed
  console.log(
    `[ATS Detector] Unknown ATS for ${companyName}, falling back to generic`,
  );
  return {
    atsType: "generic",
    companyToken: extractDomainAsToken(url),
    normalizedUrl: url,
  };
}

function lookupKnown(
  url: string,
): { atsType: AtsType; companyToken: string } | null {
  for (const [pattern, config] of Object.entries(KNOWN_COMPANIES)) {
    if (url.includes(pattern)) return config;
  }
  return null;
}

function detectFromUrl(url: string): DetectedAts | null {
  for (const rule of URL_RULES) {
    const match = url.match(rule.pattern);
    if (match) {
      return {
        atsType: rule.atsType,
        companyToken: rule.extractToken(match),
        normalizedUrl: url,
      };
    }
  }
  return null;
}

function detectFromDom(
  html: string,
): Omit<DetectedAts, "normalizedUrl"> | null {
  for (const fp of DOM_FINGERPRINTS) {
    if (fp.signals.some((s) => html.includes(s))) {
      const token = fp.extractToken(html);
      if (token) return { atsType: fp.atsType, companyToken: token };
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
