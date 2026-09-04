import { createWorld, trait } from '@koota/core';
import { describe, expect, it } from 'vitest';
import { getTab, INITIAL_NAV, transition, type NavState } from '../src/devtools/state/nav';

const world = createWorld();
const otherWorld = createWorld();
const entityA = world.spawn();
const entityB = world.spawn();
const TraitA = trait();
const TraitB = trait();

const worldList: NavState = { screen: 'world-list' };
const worldDetail: NavState = { screen: 'world-detail', world };
const entityList: NavState = { screen: 'entity-list' };
const entityDetail: NavState = { screen: 'entity-detail', entity: entityA };
const traitList: NavState = { screen: 'trait-list' };
const traitDetail: NavState = { screen: 'trait-detail', trait: TraitA };
const graph: NavState = { screen: 'graph' };
const everyScreen = [worldList, worldDetail, entityList, entityDetail, traitList, traitDetail, graph];

describe('navigation machine', () => {
  it('starts on the entity list', () => {
    expect(INITIAL_NAV).toEqual(entityList);
    expect(getTab(INITIAL_NAV)).toBe('entities');
  });

  it('lands on the tab home from every screen', () => {
    for (const state of everyScreen) {
      expect(transition(state, { type: 'show-tab', tab: 'worlds' })).toEqual(worldList);
      expect(transition(state, { type: 'show-tab', tab: 'entities' })).toEqual(entityList);
      expect(transition(state, { type: 'show-tab', tab: 'traits' })).toEqual(traitList);
      expect(transition(state, { type: 'show-tab', tab: 'graph' })).toEqual(graph);
    }
  });

  it('opens a world from every screen and shows the worlds tab', () => {
    for (const state of everyScreen) {
      const next = transition(state, { type: 'open-world', world: otherWorld });
      expect(next).toEqual({ screen: 'world-detail', world: otherWorld });
      expect(getTab(next)).toBe('worlds');
    }
  });

  it('leaves world detail when its world is destroyed', () => {
    expect(transition(worldDetail, { type: 'world-destroyed', world })).toEqual(worldList);
  });

  it('ignores destroyed worlds that are not on screen', () => {
    for (const state of everyScreen) {
      expect(transition(state, { type: 'world-destroyed', world: otherWorld })).toBe(state);
    }
  });

  it('opens an entity from every screen and shows the entities tab', () => {
    for (const state of everyScreen) {
      const next = transition(state, { type: 'open-entity', entity: entityB });
      expect(next).toEqual({ screen: 'entity-detail', entity: entityB });
      expect(getTab(next)).toBe('entities');
    }
  });

  it('opens a trait from every screen and shows the traits tab', () => {
    for (const state of everyScreen) {
      const next = transition(state, { type: 'open-trait', trait: TraitB });
      expect(next).toEqual({ screen: 'trait-detail', trait: TraitB });
      expect(getTab(next)).toBe('traits');
    }
  });

  it('leaves entity detail when its entity is destroyed', () => {
    expect(transition(entityDetail, { type: 'entity-destroyed', entity: entityA })).toEqual(
      entityList
    );
  });

  it('ignores destroyed entities that are not on screen', () => {
    for (const state of everyScreen) {
      expect(transition(state, { type: 'entity-destroyed', entity: entityB })).toBe(state);
    }
  });

  it('leaves trait detail when its trait is unregistered', () => {
    expect(transition(traitDetail, { type: 'trait-unregistered', trait: TraitA })).toEqual(traitList);
  });

  it('ignores unregistered traits that are not on screen', () => {
    for (const state of everyScreen) {
      expect(transition(state, { type: 'trait-unregistered', trait: TraitB })).toBe(state);
    }
  });

  it('returns to a list by picking the current tab', () => {
    expect(transition(worldDetail, { type: 'show-tab', tab: 'worlds' })).toEqual(worldList);
    expect(transition(entityDetail, { type: 'show-tab', tab: 'entities' })).toEqual(entityList);
    expect(transition(traitDetail, { type: 'show-tab', tab: 'traits' })).toEqual(traitList);
  });

  it('walks a full round trip through every screen', () => {
    let state = INITIAL_NAV;
    state = transition(state, { type: 'open-entity', entity: entityA });
    state = transition(state, { type: 'open-trait', trait: TraitA });
    expect(state).toEqual(traitDetail);
    state = transition(state, { type: 'open-entity', entity: entityB });
    expect(state).toEqual({ screen: 'entity-detail', entity: entityB });
    state = transition(state, { type: 'show-tab', tab: 'graph' });
    expect(state).toEqual(graph);
    state = transition(state, { type: 'open-entity', entity: entityA });
    expect(state).toEqual(entityDetail);
    state = transition(state, { type: 'entity-destroyed', entity: entityA });
    expect(state).toEqual(entityList);
  });
});
