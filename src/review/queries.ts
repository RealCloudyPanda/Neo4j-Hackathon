import { loadQuery } from "../relate/store.ts";

export const REVIEW_QUERIES = ["drift", "impact", "tests"] as const;

export function reviewQueryTexts(): Record<string, string> {
  return Object.fromEntries(REVIEW_QUERIES.map((q) => [q, loadQuery(q)]));
}
