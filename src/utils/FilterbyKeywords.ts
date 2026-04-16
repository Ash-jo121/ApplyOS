import { NormalizedJob } from "../types/Scraper";

export function filterByKeywords(
  jobs: NormalizedJob[],
  keywords: string[],
): NormalizedJob[] {
  if (!keywords || keywords.length === 0) return jobs;

  const escaped = keywords
    .map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`\\b(${escaped})\\b`, "i");

  return jobs.filter((job) => {
    const searchText = [
      job.title,
      job.content,
      ...job.departments,
      job.location,
    ].join(" ");
    return regex.test(searchText);
  });
}
