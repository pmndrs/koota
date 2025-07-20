import { type Entity, trait } from 'koota';

export const Avoidance = trait({
	neighbors: () => [] as Entity[],
	range: 1.5,
});
