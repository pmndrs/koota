import type { Trait, World } from '@koota/core';
import { useEffect, useReducer, useRef } from 'react';
import { INITIAL_NAV, transition } from './nav';

/**
 * Runs the navigation machine and feeds it the world events it reacts to, so
 * a screen never outlives its subject.
 */
export function useNav(world: World, traits: Trait[]) {
  const [nav, send] = useReducer(transition, INITIAL_NAV);

  // Destroys arrive per entity, so only the one the detail screen is showing is sent on.
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    return world.onEntityDestroy((entity) => {
      const current = navRef.current;
      if (current.screen === 'entity-detail' && current.entity === entity) {
        send({ type: 'entity-destroyed', entity });
      }
    });
  }, [world]);

  useEffect(() => {
    if (nav.screen === 'trait-detail' && !traits.includes(nav.trait)) {
      send({ type: 'trait-unregistered', trait: nav.trait });
    }
  }, [nav, traits]);

  return { nav, send };
}
