import type { Entity } from 'koota';
import { IsDevtoolsHovered, IsDevtoolsHovering, IsDevtoolsSelected } from 'koota/devtools';
import { useTag, useWorld } from 'koota/react';

export function useDevtoolsHighlight(entity: Entity) {
	const world = useWorld();
	const isHovered = useTag(entity, IsDevtoolsHovered);
	const isSelected = useTag(entity, IsDevtoolsSelected);
	const isAnythingHovered = useTag(world, IsDevtoolsHovering);

	const shouldFade = isAnythingHovered && !isSelected && !isHovered;

	return {
		color: isSelected ? 'red' : isHovered ? '#00ffff' : null,
		opacity: shouldFade ? 0.15 : 1,
	};
}
