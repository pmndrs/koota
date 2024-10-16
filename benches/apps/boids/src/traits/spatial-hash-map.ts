import { trait } from 'koota';
import { SpatialHashMap as SpatialHashMapImpl } from '../utils/spatial-hash';

export const SpatialHashMap = trait({
	value: () => new SpatialHashMapImpl(5),
});
