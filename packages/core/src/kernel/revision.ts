/**
 * Logical clock shared by every world. Mutations stamp the current revision.
 * Consuming a tracking query and creating a tracker advance it, so later
 * events compare greater than any stamp observed before.
 */
export let revision = 1;

export function advanceRevision(): number {
  if (revision >= Number.MAX_SAFE_INTEGER) throw new Error('Koota: Revision overflow.');
  return ++revision;
}
