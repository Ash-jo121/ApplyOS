import * as cheerio from "cheerio";
import { ImapFlow } from "imapflow";
import PostalMime from "postal-mime";
import { COMPANIES, PROFILE } from "./config.js";
import { stableId, stripHtml } from "./lib/text.js";
import type { Job } from "./types.js";

const ALERT_DOMAINS = ["linkedin.com", "instahyre.com"];
const GENERIC_LINK_TEXT = /^(apply|apply now|learn more|see (?:all )?jobs?|view (?:job|details)|open|click here)$/i;

const COMPANY_ALIASES: Record<string, string[]> = {
  cred: ["cred"],
  practo: ["practo"],
  "observe-ai": ["observe.ai", "observe ai"],
  jpmc: ["jpmorgan chase", "jp morgan", "jpmc"],
  microsoft: ["microsoft"],
  cadence: ["cadence"],
  jiohotstar: ["jiohotstar", "jio hotstar", "jiostar", "jio star", "hotstar"],
  "ibm-isl": ["ibm isl", "india software labs", "ibm"],
  ameriprise: ["ameriprise"],
  walmart: ["walmart"],
  cohesity: ["cohesity"],
  nutanix: ["nutanix"],
  "societe-generale": ["société générale", "societe generale"],
  cisco: ["cisco"],
  nike: ["nike"],
  thoughtworks: ["thoughtworks", "thought works"],
  ather: ["ather energy", "ather"],
  target: ["target corporation", "target india", "target"],
};

export interface AlertMessage {
  from: string;
  subject?: string;
  html?: string;
  text?: string;
  date?: string | Date;
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function senderSource(from: string): "linkedin" | "instahyre" | null {
  const domain = from.toLowerCase().match(/@([^>\s]+)>?\s*$/)?.[1];
  if (domain === "linkedin.com") return "linkedin";
  if (domain === "instahyre.com") return "instahyre";
  return null;
}

function inferCompanies(value: string) {
  const haystack = ` ${normalized(value)} `;
  const matches = [];
  for (const company of COMPANIES) {
    for (const alias of COMPANY_ALIASES[company.id] ?? [company.name]) {
      const needle = normalized(alias);
      if (needle && haystack.includes(` ${needle} `)) {
        matches.push(company);
        break;
      }
    }
  }
  return matches;
}

function unwrapUrl(rawUrl: string): URL | null {
  let value = rawUrl.replace(/&amp;/g, "&");
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const url = new URL(value);
      const nested = ["url", "redirect", "redirectUrl", "destination", "dest"]
        .map((key) => url.searchParams.get(key))
        .find((candidate) => candidate?.startsWith("http"));
      if (!nested) return url;
      value = nested;
    } catch {
      return null;
    }
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function canonicalJobUrl(rawUrl: string, source: "linkedin" | "instahyre"): string | null {
  const url = unwrapUrl(rawUrl);
  if (!url) return null;
  const host = url.hostname.toLowerCase();

  if (source === "linkedin") {
    if (!host.endsWith("linkedin.com")) return null;
    const match = url.pathname.match(/\/(?:comm\/)?jobs\/view\/(?:[^/]*-)?(\d+)/i);
    return match ? `https://www.linkedin.com/jobs/view/${match[1]}` : null;
  }

  if (!host.endsWith("instahyre.com") || !/\/(?:job|jobs|opportunit)/i.test(url.pathname)) return null;
  if (/\/(?:help|blog|employer|recruiter)/i.test(url.pathname)) return null;
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|trk|tracking|ref)/i.test(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString();
}

function titleFromUrl(rawUrl: string): string {
  const url = unwrapUrl(rawUrl);
  if (!url) return "";
  const segment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  return decodeURIComponent(segment)
    .replace(/-\d+$/, "")
    .replace(/-at-.+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function inferLocation(value: string): string {
  const locations = PROFILE.preferredLocations
    .filter((location) => new RegExp(`\\b${location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(value))
    .map((location) => location.replace(/\b\w/g, (character) => character.toUpperCase()));
  return [...new Set(locations)].slice(0, 3).join(", ");
}

function makeJob(
  source: "linkedin" | "instahyre",
  rawUrl: string,
  titleText: string,
  context: string,
  wholeMessage: string,
  date: string | Date | undefined,
  allowMessageFallback = false,
): Job | null {
  const url = canonicalJobUrl(rawUrl, source);
  if (!url) return null;
  const contextCompanies = inferCompanies(context);
  const messageCompanies = inferCompanies(wholeMessage);
  const company = contextCompanies[0] ?? (allowMessageFallback && messageCompanies.length === 1 ? messageCompanies[0] : null);
  if (!company) return null;
  const cleanTitle = stripHtml(titleText).trim();
  const title = !cleanTitle || GENERIC_LINK_TEXT.test(cleanTitle) ? titleFromUrl(rawUrl) : cleanTitle;
  if (!title) return null;
  const postedAt = date ? new Date(date) : null;

  return {
    id: stableId(company.id, `${source}:${url}`),
    companyId: company.id,
    company: company.name,
    source,
    title,
    location: inferLocation(context),
    description: context,
    url,
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt.toISOString() : null,
    scrapedAt: new Date().toISOString(),
  };
}

export function parseAlertMessage(message: AlertMessage): Job[] {
  const source = senderSource(message.from);
  if (!source) return [];
  const html = message.html ?? "";
  const $ = cheerio.load(html);
  const wholeMessage = stripHtml(`${message.subject ?? ""} ${message.text ?? ""} ${$("body").html() ?? ""}`);
  const jobs = new Map<string, Job>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const container = $(element).closest("tr, li, article").first();
    const contextMarkup = container.length ? container.html() : $(element).parent().html();
    const context = stripHtml(`${contextMarkup ?? ""} ${message.subject ?? ""}`);
    const title = $(element).attr("aria-label") ?? $(element).attr("title") ?? $(element).text();
    const job = makeJob(source, href, title, context, wholeMessage, message.date);
    if (job) jobs.set(job.url, job);
  });

  const plainText = message.text ?? "";
  const plainUrls = [...plainText.matchAll(/https?:\/\/[^\s<>"']+/g)];
  for (const match of plainUrls) {
    const href = match[0];
    const offset = match.index ?? 0;
    const context = stripHtml(plainText.slice(Math.max(0, offset - 300), offset + href.length + 300));
    const job = makeJob(source, href, "", context, wholeMessage, message.date, plainUrls.length === 1);
    if (job) jobs.set(job.url, job);
  }

  return [...jobs.values()];
}

function mailboxAddress(message: Awaited<ReturnType<typeof PostalMime.parse>>): string {
  const from = message.from;
  if (!from || !("address" in from)) return "";
  return from.address ?? "";
}

export function emailAlertImportEnabled(): boolean {
  return process.env.EMAIL_ALERT_IMPORT_ENABLED?.toLowerCase() === "true";
}

export async function fetchEmailAlertJobs(): Promise<Job[]> {
  if (!emailAlertImportEnabled()) return [];
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Gmail credentials are required to import LinkedIn and Instahyre alerts");

  const lookbackDays = Math.min(30, Math.max(1, Number(process.env.EMAIL_ALERT_LOOKBACK_DAYS) || 7));
  const maxMessages = Math.min(250, Math.max(1, Number(process.env.EMAIL_ALERT_MAX_MESSAGES) || 100));
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const jobs = new Map<string, Job>();
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const matches = await client.search(
        { since, or: ALERT_DOMAINS.map((domain) => ({ from: domain })) },
        { uid: true },
      );
      const uids = (matches || []).slice(-maxMessages);
      if (!uids.length) return [];

      for await (const record of client.fetch(uids, { source: { maxLength: 1_500_000 } }, { uid: true })) {
        if (!record.source) continue;
        const message = await PostalMime.parse(record.source, { maxHeadersSize: 100_000 });
        for (const job of parseAlertMessage({
          from: mailboxAddress(message),
          subject: message.subject,
          html: message.html,
          text: message.text,
          date: message.date,
        })) {
          jobs.set(job.url, job);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    if (client.usable) await client.logout();
    else client.close();
  }
  return [...jobs.values()];
}
