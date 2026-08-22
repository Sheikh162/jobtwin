import type { ListingCandidate } from "@/agent/ats";

export interface DiffResult {
  foundListings: ListingCandidate[];
  closedExternalIds: string[];
}

/**
 * Diff a fresh crawl against the previous snapshot. A listing is "new" if it
 * didn't exist before; "closed" if the externalId disappeared (and it wasn't
 * already closed).
 */
export function diffListings(previous: ListingCandidate[], fresh: ListingCandidate[]): DiffResult {
  const previousById = new Map(previous.map((l) => [l.externalId, l]));
  const freshById = new Map(fresh.map((l) => [l.externalId, l]));

  const closedExternalIds: string[] = [];
  for (const id of previousById.keys()) {
    if (!freshById.has(id)) closedExternalIds.push(id);
  }

  return {
    foundListings: fresh, // full list to upsert into DB
    closedExternalIds,
  };
}