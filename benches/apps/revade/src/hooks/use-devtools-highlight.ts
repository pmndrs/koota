import type { Entity } from 'koota';
import { IsDevtoolsHovered, IsDevtoolsHovering, IsDevtoolsSelected } from 'koota/devtools';
import { useTag, useWorld } from 'koota/react';

export function useDevtoolsHighlight(entity: Entity) {
	const world = useWorld();
	const isHovered = useTag(entity, IsDevtoolsHovered);
	const isSelected = useTag(entity, IsDevtoolsSelected);
	const isAnythingHovered = useTag(world, IsDevtoolsHovering);

	const isHighlighted = isHovered || isSelected;
	const shouldFade = isAnythingHovered && !isSelected && !isHovered;

	return {
		color: isSelected ? '#ffff00' : isHovered ? '#00ffff' : null,
		scale: isHighlighted ? 1.05 : 1,
		opacity: shouldFade ? 0.15 : 1,
	};
}
