import type { Archetype } from './archetype';
import type { TypeId } from './id';
import type { World } from './world';

/** Include and exclude terms with a live list of matching archetypes. */
export type Filter = {
  readonly key: string;
  readonly include: readonly TypeId[];
  readonly exclude: readonly TypeId[];
  readonly archetypes: Archetype[];
  /** Membership by archetype id. */
  matched: Uint8Array;
};

export function filterKey(include: readonly TypeId[], exclude: readonly TypeId[]): string {
  return `${include.join(',')}|${exclude.join(',')}`;
}

export function matchesTerms(
  archetype: Archetype,
  include: readonly TypeId[],
  exclude: readonly TypeId[]
): boolean {
  const types = archetype.records;
  for (let i = 0; i < include.length; i++) if (!types.has(include[i])) return false;
  for (let i = 0; i < exclude.length; i++) if (types.has(exclude[i])) return false;
  return true;
}

export function filterMatches(filter: Filter, archetype: Archetype): boolean {
  return archetype.id < filter.matched.length && filter.matched[archetype.id] === 1;
}

function admit(filter: Filter, archetype: Archetype): void {
  filter.archetypes.push(archetype);
  if (archetype.id >= filter.matched.length) {
    let capacity = filter.matched.length;
    while (capacity <= archetype.id) capacity *= 2;
    const matched = new Uint8Array(capacity);
    matched.set(filter.matched);
    filter.matched = matched;
  }
  filter.matched[archetype.id] = 1;
}

function evict(filter: Filter, archetype: Archetype): void {
  const index = filter.archetypes.indexOf(archetype);
  if (index >= 0) filter.archetypes.splice(index, 1);
  if (archetype.id < filter.matched.length) filter.matched[archetype.id] = 0;
}

/** Terms must be sorted and deduplicated. */
export function ensureFilter(world: World, include: readonly TypeId[], exclude: readonly TypeId[]): Filter {
  const key = filterKey(include, exclude);
  let filter = world.filters.get(key);
  if (filter) return filter;
  filter = {
    key,
    include,
    exclude,
    archetypes: [],
    matched: new Uint8Array(Math.max(16, world.archetypes.length)),
  };
  if (include.length === 0) {
    const archetypes = world.archetypes;
    for (let i = 0; i < archetypes.length; i++) {
      const archetype = archetypes[i];
      if (archetype && matchesTerms(archetype, include, exclude)) admit(filter, archetype);
    }
    world.filtersAll.push(filter);
  } else {
    let rarest: Archetype[] | undefined;
    let registerUnder = include[0];
    let fewestFilters = Infinity;
    for (let i = 0; i < include.length; i++) {
      const records = world.recordsByType.get(include[i]);
      const count = records ? records.length : 0;
      if (count === 0) {
        rarest = undefined;
        break;
      }
      if (rarest === undefined || count < rarest.length) rarest = records;
      const filters = world.filtersByType.get(include[i]);
      const registered = filters ? filters.length : 0;
      if (registered < fewestFilters) {
        fewestFilters = registered;
        registerUnder = include[i];
      }
    }
    if (rarest) {
      for (let i = 0; i < rarest.length; i++) {
        if (matchesTerms(rarest[i], include, exclude)) admit(filter, rarest[i]);
      }
    }
    let filters = world.filtersByType.get(registerUnder);
    if (!filters) world.filtersByType.set(registerUnder, (filters = []));
    filters.push(filter);
  }
  world.filters.set(key, filter);
  return filter;
}

export function filterArchetypeCreated(world: World, archetype: Archetype): void {
  const types = archetype.types;
  for (let i = 0; i < types.length; i++) {
    const filters = world.filtersByType.get(types[i]);
    if (!filters) continue;
    for (let j = 0; j < filters.length; j++) {
      const filter = filters[j];
      if (matchesTerms(archetype, filter.include, filter.exclude)) admit(filter, archetype);
    }
  }
  const all = world.filtersAll;
  for (let i = 0; i < all.length; i++) {
    if (matchesTerms(archetype, all[i].include, all[i].exclude)) admit(all[i], archetype);
  }
}

export function filterArchetypeDestroyed(world: World, archetype: Archetype): void {
  const types = archetype.types;
  for (let i = 0; i < types.length; i++) {
    const filters = world.filtersByType.get(types[i]);
    if (!filters) continue;
    for (let j = 0; j < filters.length; j++) evict(filters[j], archetype);
  }
  const all = world.filtersAll;
  for (let i = 0; i < all.length; i++) evict(all[i], archetype);
}
