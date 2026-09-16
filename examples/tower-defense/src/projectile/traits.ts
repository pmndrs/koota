import { trait, type Entity } from 'koota';
import type { TowerKind } from '../tower/traits';

export const Projectile = trait({
  kind: 'cannon' as TowerKind,
  lane: 0,
  damage: 0,
  radius: 0,
  life: 2,
  level: 1,
});
export type Impact = {
  x: number;
  y: number;
  z: number;
  lane: number;
  kind: TowerKind;
  damage: number;
  radius: number;
  level: number;
};
export const Impacts = trait(() => [] as Impact[]);
export const DamageHits = trait(
  () => [] as { target: Entity; kind: TowerKind; damage: number; level: number }[]
);
export const DebrisQueue = trait(() => [] as { x: number; y: number; z: number; color: string }[]);
export const Debris = trait({ remaining: 0.8, color: '#c57b59' });
export const Blast = trait({ age: 0, duration: 0.28, radius: 1, kind: 'cannon' as TowerKind });
