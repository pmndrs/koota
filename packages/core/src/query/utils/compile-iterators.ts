import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { isEntityAlive } from '../../entity/utils/entity-index';
import { ENTITY_ID_MASK } from '../../entity/utils/pack-entity';
import type { Store } from '../../storage';
import type { Trait } from '../../trait/types';
import type { WorldContext } from '../../world';
import type { QueryIterationBuffers } from '../types';

type Callback = (state: any, entity: Entity, index: number) => void;
type Iterate<R = void> = (
  ctx: WorldContext,
  entities: readonly Entity[],
  callback: Callback,
  buffers: QueryIterationBuffers,
  stores: Store<any>[]
) => R;

export type QueryIterators = {
  readEach: Iterate;
  /** Writes every trait back without change detection. */
  updateEach: Iterate;
  /** Writes every trait back and records changes for traits whose mode is not 0. Returns the count. */
  trackEach: Iterate<number>;
  /** Drops references to user objects and restores owned tuple arrays. */
  release: (buffers: QueryIterationBuffers) => void;
};

type IteratorCache = {
  traits: WeakMap<Trait, IteratorCache>;
  iterators: QueryIterators | undefined;
};

// Weak keys at every position share iterators across worlds without retaining unused traits.
const iteratorCache: IteratorCache = { traits: new WeakMap(), iterators: undefined };

export function getQueryIterators(traits: Trait[]): QueryIterators {
  let cache = iteratorCache;
  for (let i = 0; i < traits.length; i++) {
    const trait = traits[i];
    let next = cache.traits.get(trait);
    if (next === undefined) {
      next = { traits: new WeakMap(), iterators: undefined };
      cache.traits.set(trait, next);
    }
    cache = next;
  }
  return (cache.iterators ??= compileQueryIterators(traits));
}

/**
 * Unrolls each trait into its own accessor call site. Each site sees one function, so V8 can inline
 * the accessors no matter how many traits the app iterates elsewhere.
 */
function compileQueryIterators(traits: Trait[]): QueryIterators {
  const accessors: unknown[] = [];
  const bind: string[] = [];
  const hoist: string[] = [];
  const modes: string[] = [];
  const read: string[] = [];
  const write: string[] = [];
  const track: string[] = [];
  const snapshot: string[] = [];
  const release: string[] = [];

  for (let j = 0; j < traits.length; j++) {
    const traitCtx = traits[j][$internal];
    const isSoA = traitCtx.type === 'soa';
    accessors.push(isSoA ? traitCtx.getInto : traitCtx.get, traitCtx.set);
    bind.push(`const g${j} = a[${j * 2}], w${j} = a[${j * 2 + 1}], T${j} = traits[${j}];`);
    hoist.push(`var s${j} = stores[${j}];`);
    modes.push(`m${j} = modes[${j}]`);
    release.push(`state[${j}] = undefined;`);

    if (isSoA) {
      hoist.push(`var r${j} = records[${j}].value;`);
      release.push(`var r${j} = records[${j}].value;`);
      const schema = traits[j].schema as Record<string, unknown>;
      let k = 0;
      for (const key in schema) {
        const field = schema[key];
        const name = JSON.stringify(key);
        if (Array.isArray(field)) {
          // A callback may replace a tuple array, and the next read must not write into the replacement.
          hoist.push(`var t${j}_${k} = records[${j}].tuples[${name}];`);
          read.push(`r${j}[${name}] = t${j}_${k};`);
          release.push(`r${j}[${name}] = records[${j}].tuples[${name}];`);
          k++;
        } else if (field == null || typeof field === 'function') {
          release.push(`r${j}[${name}] = undefined;`);
        }
      }
      read.push(`state[${j}] = g${j}(ctx, eid, s${j}, r${j});`);
    } else {
      read.push(`state[${j}] = g${j}(ctx, eid, s${j});`);
    }

    write.push(`w${j}(ctx, eid, s${j}, state[${j}]);`);
    if (isSoA) {
      track.push(
        `if (w${j}(ctx, eid, s${j}, state[${j}]) && m${j} !== 0) { changedEntities[changed] = entity; changedTraits[changed++] = T${j}; }`
      );
    } else {
      // An atomic value mutated in place is the same reference, so compare its snapshot.
      snapshot.push(`if (m${j} === 2) snapshotAtomic(state[${j}], snapshots, ${j});`);
      track.push(
        `if (w${j}(ctx, eid, s${j}, state[${j}]) ? m${j} !== 0 : m${j} === 2 && atomicChanged(state[${j}], snapshots[${j}])) { changedEntities[changed] = entity; changedTraits[changed++] = T${j}; }`
      );
    }
  }

  const setup = `
    var state = buffers.state, records = buffers.records;
    ${hoist.join('\n    ')}`;
  const loop = (body: string) => `
    for (var i = 0; i < entities.length; i++) {
      var entity = entities[i], eid = entity & ${ENTITY_ID_MASK};
      ${read.join('\n      ')}
      ${body}
    }`;

  return new Function(
    'a',
    'traits',
    'isEntityAlive',
    'snapshotAtomic',
    'atomicChanged',
    `'use strict';
  ${bind.join('\n  ')}
  return {
    readEach: function read(ctx, entities, callback, buffers, stores) {${setup}${loop(
      'callback(state, entity, i);'
    )}
    },
    updateEach: function update(ctx, entities, callback, buffers, stores) {${setup}${loop(`callback(state, entity, i);
      if (!isEntityAlive(ctx.entityIndex, entity)) continue;
      ${write.join('\n      ')}`)}
    },
    trackEach: function track(ctx, entities, callback, buffers, stores) {${setup}
    var modes = buffers.modes${modes.length ? ', ' + modes.join(', ') : ''};
    var snapshots = buffers.atomicSnapshots, changedEntities = buffers.changedEntities;
    var changedTraits = buffers.changedTraits, changed = 0;${loop(`${snapshot.join('\n      ')}
      callback(state, entity, i);
      if (!isEntityAlive(ctx.entityIndex, entity)) continue;
      ${track.join('\n      ')}`)}
      return changed;
    },
    release: function release(buffers) {
      var state = buffers.state, records = buffers.records;
      ${release.join('\n      ')}
    },
  };`
  )(accessors, traits.slice(), isEntityAlive, snapshotAtomic, atomicChanged) as QueryIterators;
}

// hasOwnProperty.call inside for-in hits a V8 fast path that Object.hasOwn does not.
function snapshotAtomic(
  value: any,
  snapshots: QueryIterationBuffers['atomicSnapshots'],
  index: number
) {
  const snapshot = (snapshots[index] ??= { keys: [], values: [], count: 0 });
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    snapshot.keys[count] = key;
    snapshot.values[count++] = value[key];
  }
  snapshot.count = count;
}

function atomicChanged(value: any, snapshot: QueryIterationBuffers['atomicSnapshots'][number]) {
  if (typeof value !== 'object' || value === null) return true;
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    let index = count++;
    if (snapshot.keys[index] !== key) {
      index = snapshot.keys.indexOf(key);
      if (index === -1 || index >= snapshot.count) return true;
    }
    if (value[key] !== snapshot.values[index]) return true;
  }
  return count !== snapshot.count;
}
