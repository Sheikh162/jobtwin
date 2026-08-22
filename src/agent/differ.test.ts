import { describe, it, expect } from "vitest";
import { diffListings } from "@/agent/differ";

const a = (externalId: string) => ({
  externalId,
  title: `Job ${externalId}`,
  location: "Remote",
  applyUrl: null,
  postedAt: null,
  description: null,
});

describe("diffListings", () => {
  it("returns the fresh list as foundListings", () => {
    const fresh = [a("1"), a("2")];
    const result = diffListings([a("1")], fresh);
    expect(result.foundListings).toEqual(fresh);
  });

  it("marks a previously-seen externalId as closed when it disappears", () => {
    const result = diffListings([a("1"), a("2")], [a("1")]);
    expect(result.closedExternalIds).toEqual(["2"]);
  });

  it("reports no closures when the set is unchanged", () => {
    const result = diffListings([a("1"), a("2")], [a("1"), a("2")]);
    expect(result.closedExternalIds).toEqual([]);
  });

  it("does not flag a brand-new listing as closed", () => {
    const result = diffListings([a("1")], [a("1"), a("3")]);
    expect(result.closedExternalIds).toEqual([]);
  });

  it("handles empty previous snapshot", () => {
    const result = diffListings([], [a("1"), a("2")]);
    expect(result.closedExternalIds).toEqual([]);
    expect(result.foundListings).toHaveLength(2);
  });

  it("dedupes by externalId", () => {
    const result = diffListings([a("1")], [a("1"), a("1")]);
    expect(result.closedExternalIds).toEqual([]);
    expect(result.foundListings).toHaveLength(2);
  });
});