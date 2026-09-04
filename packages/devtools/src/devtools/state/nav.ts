import type { Entity, Trait } from '@koota/core';

export type Tab = 'entities' | 'traits' | 'graph';

/** Each screen the devtools can show. Detail screens carry their subject. */
export type NavState =
  | { screen: 'entity-list' }
  | { screen: 'entity-detail'; entity: Entity }
  | { screen: 'trait-list' }
  | { screen: 'trait-detail'; trait: Trait }
  | { screen: 'graph' };

export type NavEvent =
  /** A header tab was picked. */
  | { type: 'show-tab'; tab: Tab }
  /** An entity was picked anywhere: a list row, a graph node, a sheet item. */
  | { type: 'open-entity'; entity: Entity }
  /** A trait was picked anywhere: a list row or an entity's trait row. */
  | { type: 'open-trait'; trait: Trait }
  /** The world destroyed an entity. */
  | { type: 'entity-destroyed'; entity: Entity }
  /** The world no longer has a trait registered, which happens on reset. */
  | { type: 'trait-unregistered'; trait: Trait };

export const INITIAL_NAV: NavState = { screen: 'entity-list' };

const TAB_HOME: Record<Tab, NavState> = {
  entities: { screen: 'entity-list' },
  traits: { screen: 'trait-list' },
  graph: { screen: 'graph' },
};

/**
 * The navigation machine. Every screen accepts every event, so any path a
 * user can take is a walk over this table.
 *
 *   from           | show-tab   | open-entity   | open-trait   | entity-destroyed | trait-unregistered
 *   ---------------|------------|---------------|--------------|------------------|-------------------
 *   entity-list    | tab's home | entity-detail | trait-detail | same             | same
 *   entity-detail  | tab's home | entity-detail | trait-detail | entity-list *    | same
 *   trait-list     | tab's home | entity-detail | trait-detail | same             | same
 *   trait-detail   | tab's home | entity-detail | trait-detail | same             | trait-list *
 *   graph          | tab's home | entity-detail | trait-detail | same             | same
 *
 *   * only when the event names the subject on screen
 *
 * Picking a tab always lands on that tab's home, so it doubles as the way
 * back out of a detail screen.
 */
export function transition(state: NavState, event: NavEvent): NavState {
  switch (event.type) {
    case 'show-tab':
      return TAB_HOME[event.tab];
    case 'open-entity':
      return { screen: 'entity-detail', entity: event.entity };
    case 'open-trait':
      return { screen: 'trait-detail', trait: event.trait };
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
