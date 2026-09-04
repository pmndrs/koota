import { $internal, type Entity, IsExcluded, type Trait, type World } from '@koota/core';

type WorldContext = World[typeof $internal];

/**
 * Which entities carry a trait, read straight from the world's bitmasks.
 *
 * `world.query(trait)` would answer the same question, but every query the devtools create
 * stays registered in the world for good and is checked on every spawn and every add or
 * remove of its trait from then on. Reading the masks costs the app nothing between reads.
 */

interface Bit {
  pages: Uint32Array[];
  flag: number;
}

/** The mask generation and bit that stand for a trait, or null when the world never saw it. */
function bitOf(ctx: WorldContext, trait: Trait): Bit | null {
  const instance = ctx.traitInstances[trait[$internal].id];
  if (!instance) return null;
  return { pages: ctx.entityMasks[instance.generationId], flag: instance.bitflag };
}

/** Koota packs an entity as `generation << 24 | id`; the id picks the mask page and offset. */
function idOf(entity: Entity): number {
  return entity & 0xffffff;
}

/**
 * Visits every alive entity with the trait, in world order, skipping excluded entities such
 * as the world entity so the result matches what a query would return. Returning true from
 * `visit` stops the scan.
 */
function scan(world: World, trait: Trait, visit: (entity: Entity) => boolean | void) {
  const ctx = world[$internal];
  const bit = bitOf(ctx, trait);
  if (!bit) return;
  const excluded = bitOf(ctx, IsExcluded);
  const { dense, aliveCount } = ctx.entityIndex;

  for (let i = 0; i < aliveCount; i++) {
    const entity = dense[i];
    const id = idOf(entity);
    const page = id >>> 10;
    const offset = id & 1023;
    if ((bit.pages[page][offset] & bit.flag) === 0) continue;
    if (excluded && (excluded.pages[page][offset] & excluded.flag) !== 0) continue;
    if (visit(entity) === true) return;
  }
}

export function readTraitEntities(world: World, trait: Trait): Entity[] {
  const entities: Entity[] = [];
  scan(world, trait, (entity) => {
    entities.push(entity);
  });
  return entities;
}

export function readTraitEntityCount(world: World, trait: Trait): number {
  let count = 0;
  scan(world, trait, () => {
    count++;
  });
  return count;
}

export function hasTraitEntities(world: World, trait: Trait): boolean {
  let found = false;
  scan(world, trait, () => (found = true));
  return found;
}

/**
 * How many entities carry each registered trait, in one pass over the entities. Each mask
 * word is walked bit by bit, so the cost is the number of memberships, not entities times
 * traits.
 */
export function readTraitCounts(world: World): Map<Trait, number> {
  const ctx = world[$internal];
  const masks = ctx.entityMasks;

  // Traits and their tallies by generation and bit position.
  const traitsByBit: (Trait | undefined)[][] = masks.map(() => []);
  const countsByBit: number[][] = masks.map(() => []);
  for (const instance of ctx.traitInstances) {
    if (!instance) continue;
    const bitIndex = 31 - Math.clz32(instance.bitflag);
    traitsByBit[instance.generationId][bitIndex] = instance.trait;
    countsByBit[instance.generationId][bitIndex] = 0;
  }

  const excluded = bitOf(ctx, IsExcluded);
  const { dense, aliveCount } = ctx.entityIndex;

  for (let i = 0; i < aliveCount; i++) {
    const id = idOf(dense[i]);
    const page = id >>> 10;
    const offset = id & 1023;
    if (excluded && (excluded.pages[page][offset] & excluded.flag) !== 0) continue;

    for (let g = 0; g < masks.length; g++) {
      let word = masks[g][page][offset];
      while (word !== 0) {
        const flag = word & -word;
        countsByBit[g][31 - Math.clz32(flag)]++;
        word ^= flag;
      }
    }
  }

  const counts = new Map<Trait, number>();
  for (let g = 0; g < masks.length; g++) {
    const traits = traitsByBit[g];
    for (let b = 0; b < traits.length; b++) {
      const trait = traits[b];
      if (trait) counts.set(trait, countsByBit[g][b]);
    }
  }
  return counts;
}
