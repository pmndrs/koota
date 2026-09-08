/**
 * Stable integer keys for interned modifiers and relation filters.
 *
 * Token 0 is reserved. It marks a parameter that is not interned and so has no identity of its
 * own. Concrete relation pairs are keyed by their relation and target instead.
 */
let cursor = 1;

export function nextQueryToken(): number {
  return cursor++;
}
