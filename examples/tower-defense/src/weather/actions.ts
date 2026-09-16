import { createActions } from 'koota';
import { Weather } from './traits';

export const weatherActions = createActions((world) => ({
  setWind: (x: number, z: number) => world.set(Weather, { x, z }),
}));
