import { trait, type Entity } from 'koota';

export const Burning = trait({ remaining: 0.9, damagePerSecond: 8 });
export const Slowed = trait({ remaining: 0.3, multiplier: 0.35 });
export type StatusHit = {
  target: Entity;
  kind: 'burning' | 'slowed';
  duration: number;
  strength: number;
};
export const StatusHits = trait(() => [] as StatusHit[]);
