import { describe, it, expect } from "vitest";
import { scoreListing, curatedMatchCheck } from "@/agent/matcher";

const baseCriteria = {
  keywords: ["backend", "typescript", "fullstack"],
  locations: ["San Francisco", "Remote"],
  remoteOnly: false,
};

describe("scoreListing", () => {
  it("scores a keyword hit and marks it as a matched keyword", () => {
    const result = scoreListing(
      { title: "Senior Backend Engineer", location: "New York" },
      baseCriteria
    );
    expect(result.score).toBeGreaterThanOrEqual(10);
    expect(result.matchedKeyword).toBe(true);
    expect(result.locationMatched).toBe(false);
    expect(result.reasons.some((r) => r.includes("backend"))).toBe(true);
  });

  it("awards a location match score", () => {
    const result = scoreListing(
      { title: "Product Manager", description: "something backend", location: "San Francisco" },
      baseCriteria
    );
    expect(result.locationMatched).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(25);
  });

  it("counts remote as a location when remoteOnly is false", () => {
    const result = scoreListing(
      { title: "Backend Engineer", location: "Remote" },
      baseCriteria
    );
    expect(result.locationMatched).toBe(true);
  });

  it("applies the remote-only preference", () => {
    const result = scoreListing(
      { title: "Backend Engineer", location: "Remote" },
      { ...baseCriteria, remoteOnly: true }
    );
    expect(result.locationMatched).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(25);
  });

  it("does not mark a location match for a non-listed location", () => {
    const result = scoreListing(
      { title: "Backend Engineer", location: "Berlin" },
      baseCriteria
    );
    expect(result.locationMatched).toBe(false);
  });

  it("scores zero for a completely unrelated listing", () => {
    const result = scoreListing(
      { title: "Sales Development Representative", location: "Austin" },
      baseCriteria
    );
    expect(result.score).toBe(0);
    expect(result.matchedKeyword).toBe(false);
  });
});

describe("curatedMatchCheck", () => {
  it("rejects a single loose keyword hit with no location (the weak case)", () => {
    const result = curatedMatchCheck(
      { title: "Backend Engineer", location: "Berlin" },
      baseCriteria
    );
    expect(result).toBeNull();
  });

  it("passes one keyword plus a location match", () => {
    const result = curatedMatchCheck(
      { title: "Backend Engineer", location: "San Francisco" },
      baseCriteria
    );
    expect(result).not.toBeNull();
    expect(result?.score).toBeGreaterThanOrEqual(25);
  });

  it("passes two keyword hits even without location", () => {
    const result = curatedMatchCheck(
      { title: "Senior Backend Product Engineer, TypeScript", location: "Berlin" },
      baseCriteria
    );
    expect(result).not.toBeNull();
  });

  it("respects a higher score floor", () => {
    const result = curatedMatchCheck(
      { title: "Backend Product Engineer, TypeScript", location: "Kenya" },
      baseCriteria,
      { scoreFloor: 40 }
    );
    // 2 keyword hits (20) below a 40 floor => rejected, even though 2+ keywords.
    expect(result).toBeNull();
  });
});