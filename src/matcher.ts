import { PROFILE } from "./config.js";
import type { Job, Match } from "./types.js";

const TITLE_RULES: Array<[RegExp, number, string]> = [
  [/front[ -]?end/i, 42, "frontend title"],
  [/\bui (?:engineer|developer)\b/i, 38, "UI engineering title"],
  [/\bweb (?:engineer|developer)\b/i, 32, "web engineering title"],
  [/full[ -]?stack/i, 24, "full-stack title"],
  [/software (?:development )?engineer|software developer/i, 12, "software engineering title"],
];

const SKILL_WEIGHTS: Record<string, number> = {
  react: 12,
  typescript: 10,
  javascript: 7,
  angular: 9,
  redux: 5,
  "context api": 3,
  html5: 3,
  css3: 3,
  "design system": 7,
  "component library": 7,
  accessibility: 6,
  wcag: 6,
  performance: 5,
  webpack: 3,
  vite: 3,
  jest: 3,
  "react testing library": 4,
  rest: 2,
  websocket: 3,
  opentelemetry: 2,
};

const HARD_EXCLUSIONS = [
  /intern(ship)?|graduate program|new grad|apprentice/i,
  /engineering manager|manager of software engineering|manager,? software engineering|director|vice president|\bvp\b/i,
  /principal|architect|staff software|staff engineer/i,
  /qa engineer|quality assurance|test engineer|sdet/i,
  /android|ios|firmware|embedded/i,
  /\bsupport\b|\btesting\b/i,
];

const BACKEND_ONLY = /backend|back-end|data engineer|devops|site reliability|infrastructure|machine learning/i;
const FRONTEND_SIGNAL = /front[ -]?end|\bui\b|\breact(?:\.js|js)?\b|\bangular(?:js)?\b|\btypescript\b|\bjavascript\b|\bhtml5?\b|\bcss3?\b|web application|design system|component librar/i;

function hasSkill(text: string, skill: string): boolean {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const suffix = skill === "react" ? "(?:\\.js|js)?" : skill === "angular" ? "(?:js)?" : skill === "rest" ? "(?:ful)?" : "";
  return new RegExp(`\\b${escaped}${suffix}\\b`, "i").test(text);
}

export function extractExperience(text: string): { min: number | null; max: number | null } {
  const normalized = text.replace(/[–—]/g, "-");
  const range = normalized.match(/(?:experience[^.]{0,60})?(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\s*(?:\+?\s*)?(?:years?|yrs?)/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };

  const minimum = normalized.match(/(?:minimum|min\.?|at least|total)?\s*(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+(?:professional|relevant|hands-on|frontend|software|web|development)){0,5}\s+(?:experience|expertise)/i);
  if (minimum) return { min: Number(minimum[1]), max: null };
  return { min: null, max: null };
}

export function matchJob(job: Job, firstSeenAt = job.scrapedAt, isNew = false): Match | null {
  const title = job.title.trim();
  const text = `${title}\n${job.location}\n${job.description}`;
  if (!title || HARD_EXCLUSIONS.some((rule) => rule.test(title))) return null;
  if (/\blead\b/i.test(title) && !/front[ -]?end|\bui\b|\bweb\b/i.test(title)) return null;
  if (BACKEND_ONLY.test(title) && !FRONTEND_SIGNAL.test(text)) return null;

  const locationKnown = job.location.trim().length > 0 && !/remote|multiple/i.test(job.location);
  const indiaLocation = PROFILE.preferredLocations.some((location) => job.location.toLowerCase().includes(location));
  if (locationKnown && !indiaLocation) return null;

  let score = indiaLocation ? 8 : 2;
  const reasons: string[] = [];

  for (const [rule, points, reason] of TITLE_RULES) {
    if (rule.test(title)) {
      score += points;
      reasons.push(reason);
      break;
    }
  }

  const matchedSkills: string[] = [];
  for (const skill of PROFILE.skills) {
    if (hasSkill(text, skill)) {
      score += SKILL_WEIGHTS[skill] ?? 1;
      matchedSkills.push(skill);
    }
  }
  if (matchedSkills.length) reasons.push(`skills: ${matchedSkills.slice(0, 5).join(", ")}`);

  const experience = extractExperience(text);
  if (experience.min !== null) {
    if (experience.min >= 7) return null;
    const distance = Math.abs(experience.min - PROFILE.years);
    score += Math.max(0, 12 - distance * 4);
    reasons.push(
      experience.max === null
        ? `${experience.min}+ years requested`
        : `${experience.min}-${experience.max} years requested`,
    );
  }

  if (/senior|sr\.?\b/i.test(title)) score -= 5;
  if (/lead/i.test(title)) score -= 18;
  if (/genesys|telephony|contact center|ivr\b/i.test(job.description)) score -= 24;
  if (/full[ -]?stack/i.test(title) && !FRONTEND_SIGNAL.test(job.description)) score -= 12;
  if (!FRONTEND_SIGNAL.test(text)) score -= 24;

  if (score < 48) return null;
  return {
    ...job,
    score: Math.min(100, score),
    reasons,
    experience,
    firstSeenAt,
    isNew,
  };
}

export function looksPotentiallyRelevant(job: Job): boolean {
  const text = `${job.title} ${job.description}`;
  return (
    !HARD_EXCLUSIONS.some((rule) => rule.test(job.title)) &&
    (FRONTEND_SIGNAL.test(text) || /full[ -]?stack|software (?:development )?engineer|software developer/i.test(job.title))
  );
}
