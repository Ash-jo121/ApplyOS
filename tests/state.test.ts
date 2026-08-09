import { describe, expect, it } from "vitest";
import { applySeenState, type SeenState } from "../src/state.js";
import type { Match } from "../src/types.js";

const base = {
  id: "cred:123",
  companyId: "cred",
  company: "CRED",
  source: "lever",
  title: "Frontend Engineer",
  location: "Bengaluru",
  description: "React",
  url: "https://example.com/123",
  postedAt: null,
  scrapedAt: "2026-08-09T00:00:00.000Z",
  score: 80,
  reasons: ["frontend title"],
  experience: { min: null, max: null },
  firstSeenAt: "",
  isNew: false,
} satisfies Match;

describe("seen state", () => {
  it("uses the first run as a silent baseline", () => {
    const state: SeenState = { initializedAt: null, jobs: {} };
    const [match] = applySeenState([base], state, "2026-08-09T01:00:00.000Z");
    expect(match.isNew).toBe(false);
    expect(state.initializedAt).not.toBeNull();
  });

  it("marks a later unseen role as new", () => {
    const state: SeenState = { initializedAt: "2026-08-08T00:00:00.000Z", jobs: {} };
    const [match] = applySeenState([base], state, "2026-08-09T01:00:00.000Z");
    expect(match.isNew).toBe(true);
  });
});
