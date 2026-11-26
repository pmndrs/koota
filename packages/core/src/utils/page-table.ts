/**
 * A table of pages by page id, filled with the empty page. Pushing keeps the elements packed,
 * which a preallocated array would not be.
 */
export function createPageTable<T>(pageLimit: number, empty: T): T[] {
  const table: T[] = [];
  growPageTable(table, pageLimit, empty);
  return table;
}

/** Extend a table with the empty page until it covers the page limit. */
export function growPageTable<T>(table: T[], pageLimit: number, empty: T) {
  for (let i = table.length; i < pageLimit; i++) table.push(empty);
}
