import { trait } from 'koota';

export const Clock = trait({ tick: 0, elapsed: 0, delta: 1 / 60 });
export const Game = trait(() => ({
  phase: 'running' as 'running' | 'won' | 'lost',
  paused: false,
  automatic: true,
  health: 100,
  maxHealth: 100,
  gold: 0,
  kills: 0,
  leaked: 0,
  spawned: 0,
  shots: 0,
  effectsAdded: 0,
  effectsRemoved: 0,
  effectsRefreshed: 0,
  targetChanges: 0,
  debrisSpawned: 0,
  message: 'Hold the line',
}));
