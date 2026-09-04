import type { Entity, Trait, World } from '@koota/core';

export type Tab = 'worlds' | 'entities' | 'traits' | 'graph';

/** Each screen the devtools can show. Detail screens carry their subject. */
export type NavState =
  | { screen: 'world-list' }
  | { screen: 'world-detail'; world: World }
  | { screen: 'entity-list' }
  | { screen: 'entity-detail'; entity: Entity }
  | { screen: 'trait-list' }
  | { screen: 'trait-detail'; trait: Trait }
  | { screen: 'graph' };

export type NavEvent =
  /** A header tab was picked. */
  | { type: 'show-tab'; tab: Tab }
  /** A world was picked from the world list. */
  | { type: 'open-world'; world: World }
  /** An entity was picked anywhere: a list row, a graph node, a sheet item. */
  | { type: 'open-entity'; entity: Entity }
  /** A trait was picked anywhere: a list row or an entity's trait row. */
  | { type: 'open-trait'; trait: Trait }
  /** A world was destroyed. */
  | { type: 'world-destroyed'; world: World }
  /** The world destroyed an entity. */
  | { type: 'entity-destroyed'; entity: Entity }
  /** The world no longer has a trait registered, which happens on reset. */
  | { type: 'trait-unregistered'; trait: Trait };

export const INITIAL_NAV: NavState = { screen: 'entity-list' };

const TAB_HOME: Record<Tab, NavState> = {
  worlds: { screen: 'world-list' },
  entities: { screen: 'entity-list' },
  traits: { screen: 'trait-list' },
  graph: { screen: 'graph' },
};

/**
 * The navigation machine. Every screen accepts every event, so any path a
 * user can take is a walk over this table.
 *
 *   from           | show-tab   | open-world   | open-entity   | open-trait   | world-destroyed | entity-destroyed | trait-unregistered
 *   ---------------|------------|--------------|---------------|--------------|-----------------|------------------|-------------------
 *   world-list     | tab's home | world-detail | entity-detail | trait-detail | same            | same             | same
 *   world-detail   | tab's home | world-detail | entity-detail | trait-detail | world-list *    | same             | same
 *   entity-list    | tab's home | world-detail | entity-detail | trait-detail | same            | same             | same
 *   entity-detail  | tab's home | world-detail | entity-detail | trait-detail | same            | entity-list *    | same
 *   trait-list     | tab's home | world-detail | entity-detail | trait-detail | same            | same             | same
 *   trait-detail   | tab's home | world-detail | entity-detail | trait-detail | same            | same             | trait-list *
 *   graph          | tab's home | world-detail | entity-detail | trait-detail | same            | same             | same
 *
 *   * only when the event names the subject on screen
 *
 * Picking a tab always lands on that tab's home, so it doubles as the way
 * back out of a detail screen. The world list stands in for the world
 * detail when there is only one world; the view decides that, not the machine.
 */
export function transition(state: NavState, event: NavEvent): NavState {
  switch (event.type) {
    case 'show-tab':
      return TAB_HOME[event.tab];
    case 'open-world':
      return { screen: 'world-detail', world: event.world };
    case 'open-entity':
      return { screen: 'entity-detail', entity: event.entity };
    case 'open-trait':
      return { screen: 'trait-detail', trait: event.trait };
    case 'world-destroyed':
      return state.screen === 'world-detail' && state.world === event.world ? TAB_HOME.worlds : state;
    case 'entity-destroyed':
      return state.screen === 'entity-detail' && state.entity === event.entity
        ? TAB_HOME.entities
        : state;
    case 'trait-unregistered':
      return state.screen === 'trait-detail' && state.trait === event.trait ? TAB_HOME.traits : state;
  }
}

export function getTab(state: NavState): Tab {
  switch (state.screen) {
    case 'world-list':
    case 'world-detail':
      return 'worlds';
    case 'entity-list':
    case 'entity-detail':
      return 'entities';
    case 'trait-list':
    case 'trait-detail':
      return 'traits';
    case 'graph':
      return 'graph';
  }
}
