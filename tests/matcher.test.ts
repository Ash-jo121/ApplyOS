import { describe, expect, it } from "vitest";
import { extractExperience, matchJob } from "../src/matcher.js";
import type { Job } from "../src/types.js";

function job(overrides: Partial<Job>): Job {
  return {
    id: "test:1",
    companyId: "test",
    company: "Test Co",
    source: "html",
    title: "Frontend Engineer II",
    location: "Bengaluru, India",
    description: "Build accessible React and TypeScript interfaces, component libraries, REST integrations and Jest tests. 3-5 years of experience.",
    url: "https://example.com/jobs/1",
    postedAt: null,
    scrapedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("extractExperience", () => {
  it("reads ranges", () => expect(extractExperience("Requires 3–5 years of experience")).toEqual({ min: 3, max: 5 }));
  it("reads minimum experience", () => expect(extractExperience("Minimum 4+ years of relevant experience")).toEqual({ min: 4, max: null }));
  it("returns unknown when a posting does not state years", () => expect(extractExperience("Strong React experience")).toEqual({ min: null, max: null }));
});

describe("matchJob", () => {
  it("strongly matches a resume-aligned frontend role", () => {
    const result = matchJob(job({}));
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(70);
    expect(result!.reasons.join(" ")).toContain("react");
  });

  it("keeps a frontend-heavy full-stack role", () => {
    const result = matchJob(job({
      title: "Software Engineer II, Full Stack",
      description: "Own React, TypeScript, CSS and Node.js product experiences. 4+ years of experience.",
    }));
    expect(result).not.toBeNull();
  });

  it("rejects backend-only roles", () => {
    expect(matchJob(job({ title: "Backend Engineer", description: "Java, Kafka and distributed systems" }))).toBeNull();
  });

  it("rejects roles far above the profile", () => {
    expect(matchJob(job({ title: "Frontend Architect", description: "React and TypeScript. 10+ years of experience." }))).toBeNull();
  });

  it("rejects internships and mobile-only roles", () => {
    expect(matchJob(job({ title: "Frontend Engineering Intern" }))).toBeNull();
    expect(matchJob(job({ title: "iOS Software Engineer" }))).toBeNull();
  });

  it("does not confuse reactive extensions with React", () => {
    expect(matchJob(job({
      title: "Software Engineer - .NET",
      description: "C#, WPF and Reactive Extension framework. 4-7 years of experience.",
    }))).toBeNull();
  });

  it("rejects application support roles", () => {
    expect(matchJob(job({ title: "Front End Support Analyst", description: "React dashboards and production support" }))).toBeNull();
  });

  it("rejects engineering managers and generic lead roles", () => {
    expect(matchJob(job({ title: "Manager of Software Engineering" }))).toBeNull();
    expect(matchJob(job({ title: "Lead Software Engineer - Full Stack" }))).toBeNull();
  });

  it("rejects known non-India locations", () => {
    expect(matchJob(job({ location: "Seattle, WA, United States" }))).toBeNull();
  });
});
