import { trait } from 'koota';

export const BoidsConfig = trait({
	initialCount: 1000,
	maxVelocity: 1,
	separationFactor: 1,
	alignmentFactor: 1,
	coherenceFactor: 1,
	avoidEdgesFactor: 1,
	avoidEdgesMaxDistance: 1,
	neighborSearchRadius: 1,
});
