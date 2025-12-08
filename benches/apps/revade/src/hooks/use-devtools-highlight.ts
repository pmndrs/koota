import type { Entity } from 'koota';
import { IsDevtoolsHovered, IsDevtoolsSelected, IsDevtoolsHighlighting } from 'koota/devtools';
import { useTag, useWorld } from 'koota/react';

export function useDevtoolsHighlight(entity: Entity) {
	const world = useWorld();
	const isHovered = useTag(entity, IsDevtoolsHovered);
	const isSelected = useTag(entity, IsDevtoolsSelected);
	const isAnythingHighlighted = useTag(world, IsDevtoolsHighlighting);

	const isHighlighted = isHovered || isSelected;

	return {
		color: isSelected ? '#ffff00' : isHovered ? '#00ffff' : null,
		scale: isHighlighted ? 1.05 : 1,
		opacity: isAnythingHighlighted && !isHighlighted ? 0.15 : 1,
	};
}

