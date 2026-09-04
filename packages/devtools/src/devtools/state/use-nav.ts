import type { Trait, World } from '@koota/core';
import { useEffect, useReducer } from 'react';
import { INITIAL_NAV, transition } from './nav';

/**
 * Runs the navigation machine and feeds it the world events it reacts to, so
 * a screen never outlives its subject.
 */
export function useNav(world: World, traits: Trait[]) {
  const [nav, send] = useReducer(transition, INITIAL_NAV);

  useEffect(() => {
    return world.onEntityDestroy((entity) => send({ type: 'entity-destroyed', entity }));
  }, [world]);

  useEffect(() => {
    if (nav.screen === 'trait-detail' && !traits.includes(nav.trait)) {
      send({ type: 'trait-unregistered', trait: nav.trait });
    }
  }, [nav, traits]);

  return { nav, send };
}
