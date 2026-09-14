import { relation, trait } from 'koota';

export const Position = trait({ x: 0, y: 0, z: 0 });
export const Velocity = trait({ x: 0, y: 0, z: 0 });
export const NeighborOf = relation();
