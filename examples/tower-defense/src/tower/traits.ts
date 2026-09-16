import { relation, trait, type Entity } from 'koota';

export type TowerKind = 'cannon' | 'flame' | 'frost';
export const Tower = trait({
  kind: 'cannon' as TowerKind,
  lane: 0,
  pad: 0,
  level: 1,
  range: 8,
  cooldown: 0,
  interval: 0.8,
  damage: 18,
  splash: 2.5,
  recoil: 0,
});
export const TowerParts = trait(() => ({
  platform: 0 as Entity,
  mount: 0 as Entity,
  barrels: [] as Entity[],
  muzzles: [] as Entity[],
  radar: 0 as Entity,
}));
export const Targeting = relation({ exclusive: true });
export const BuildPads = trait(() => new Map<number, Entity>());
