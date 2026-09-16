import { trait } from 'koota';

export const IsEnemy = trait();
export const IsDead = trait();
export const IsFireproof = trait();
export const Health = trait({ current: 30, maximum: 30 });
export const Armor = trait({ physical: 0, fire: 0, cold: 0 });
export const Movement = trait({ speed: 2.2, sway: 0.1, frequency: 4, heading: 0 });
export const Route = trait({ lane: 0, distance: 0, lateral: 0 });
export const Bounty = trait({ gold: 5, baseDamage: 1 });
export const Shield = trait({ current: 12, maximum: 12, recharge: 0.4, delay: 3, lastHit: -3 });
export const EnemyKind = trait({ value: 0 });
