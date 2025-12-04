import type { Entity, Relation, Trait, World } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import type { TraitWithDebug } from '../../types';
import { getTraitName } from '../components/trait-utils';

export interface GraphNode {
	id: string;
	entity: Entity;
	label: string;
}

export interface GraphLink {
	id: string;
	source: string;
	target: string;
	relation: Relation<Trait>;
	relationName: string;
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
}

export function buildGraphData(world: World, relationTraits: Trait[]): GraphData {
	const nodesMap = new Map<Entity, GraphNode>();
	const links: GraphLink[] = [];
	const linkIdSet = new Set<string>();

	// Collect all entities that have relations
	for (const trait of relationTraits) {
		const traitCtx = trait[$internal];
		const relation = traitCtx.relation;
		if (!relation) continue;

		const relationName = getTraitName(trait as TraitWithDebug);
		const entities = world.query(trait);

		for (const entity of entities) {
			// Add source node
			if (!nodesMap.has(entity)) {
				const { entityId } = unpackEntity(entity);
				nodesMap.set(entity, {
					id: String(entity),
					entity,
					label: `Entity ${entityId}`,
				});
			}

			// Get targets for this entity
			const targets = entity.targetsFor(relation);
			for (const target of targets) {
				// Add target node
				if (!nodesMap.has(target)) {
					const { entityId } = unpackEntity(target);
					nodesMap.set(target, {
						id: String(target),
						entity: target,
						label: `Entity ${entityId}`,
					});
				}

				// Add link (avoid duplicates, only if both nodes exist)
				const sourceId = String(entity);
				const targetId = String(target);
				const linkId = `${sourceId}-${targetId}-${relationName}`;
				if (!linkIdSet.has(linkId) && nodesMap.has(entity) && nodesMap.has(target)) {
					linkIdSet.add(linkId);
					links.push({
						id: linkId,
						source: sourceId,
						target: targetId,
						relation,
						relationName,
					});
				}
			}
		}
	}

	const nodes = Array.from(nodesMap.values());
	
	// Filter links to only include those where both source and target nodes exist
	const validLinks = links.filter((link) => {
		const sourceExists = nodes.some((node) => node.id === link.source);
		const targetExists = nodes.some((node) => node.id === link.target);
		return sourceExists && targetExists;
	});

	// Initialize node positions at center to prevent sudden movement
	// If nodes already have positions, preserve them
	const nodesWithPositions = nodes.map((node) => {
		if ('x' in node && 'y' in node && typeof node.x === 'number' && typeof node.y === 'number') {
			return node;
		}
		return {
			...node,
			x: 130, // Center of 260px width
			y: 125, // Center of 250px height
			vx: 0, // No initial velocity
			vy: 0,
		};
	});

	return {
		nodes: nodesWithPositions,
		links: validLinks,
	};
}

