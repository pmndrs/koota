import type { Entity, World } from 'koota';
import { ChildOf } from '../traits';
import { root } from './init';

function traverseFromNode(world: World, node: Entity) {
	const children = world.query(ChildOf(node));

	for (const child of children) {
		traverseFromNode(world, child);
	}
}

export function traverse({ world }: { world: World }) {
	traverseFromNode(world, root);
}
