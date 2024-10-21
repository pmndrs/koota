import { trait } from 'koota';
import { SpatialHashMap as SpatialHashMapImpl } from '../utils/spatial-hash';

export const SpatialHashMap = trait(() => new SpatialHashMapImpl(5));
