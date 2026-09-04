import type { Trait, World } from '@koota/core';
import { $internal } from '@koota/core';
import { useEffect, useState } from 'react';
import {
  IsDevtoolsHighlighting,
  IsDevtoolsHovered,
  IsDevtoolsHovering,
  IsDevtoolsSelected,
  IsDevtoolsSelecting,
} from '../../../traits';
import { getTraitRelation } from '../../model/trait-info';

const DEVTOOLS_TRAITS = new Set<Trait>([
  IsDevtoolsHovered,
  IsDevtoolsSelected,
  IsDevtoolsHovering,
  IsDevtoolsSelecting,
  IsDevtoolsHighlighting,
]);

const DEBOUNCE_MS = 80;

/**
 * A counter that bumps (debounced) whenever anything that can change the relation graph
 * happens: relation pairs added, removed or changed; entities spawned or destroyed; any data
 * trait added or removed, since that moves an entity between archetypes. The devtools' own
 * hover and selection tags are ignored so interacting with the graph never re-lays it out.
 */
export function useGraphVersion(world: World): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const ctx = world[$internal];
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timeout !== null) return;
      timeout = setTimeout(() => {
        timeout = null;
        setVersion((v) => v + 1);
      }, DEBOUNCE_MS);
    };

    const unsubs: (() => void)[] = [];
    const subscribe = (trait: Trait) => {
      if (DEVTOOLS_TRAITS.has(trait)) return;
      unsubs.push(world.onAdd(trait, bump), world.onRemove(trait, bump));
      if (getTraitRelation(trait) !== null) unsubs.push(world.onChange(trait, bump));
    };

    for (const trait of world.traits) subscribe(trait);

    const onRegistered = (trait: Trait) => {
      subscribe(trait);
      bump();
    };
    ctx.traitRegisteredSubscriptions.add(onRegistered);
    ctx.entitySpawnSubscriptions.add(bump);
    ctx.entityDestroySubscriptions.add(bump);
    ctx.resetSubscriptions.add(bump);

    return () => {
      if (timeout !== null) clearTimeout(timeout);
      for (const unsub of unsubs) unsub();
      ctx.traitRegisteredSubscriptions.delete(onRegistered);
      ctx.entitySpawnSubscriptions.delete(bump);
      ctx.entityDestroySubscriptions.delete(bump);
      ctx.resetSubscriptions.delete(bump);
    };
  }, [world]);

  return version;
}
