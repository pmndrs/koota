import type { World } from '@koota/core';
import {
	IsDevtoolsHighlighting,
	IsDevtoolsHovered,
	IsDevtoolsHovering,
	IsDevtoolsSelected,
	IsDevtoolsSelecting,
} from '../../traits';

export function syncHighlightTags(world: World) {
	// Query for entities with hover/select traits (trait presence only)
	const anyHovered = world.query(IsDevtoolsHovered).length > 0;
	const anySelected = world.query(IsDevtoolsSelected).length > 0;

	if (anyHovered) world.add(IsDevtoolsHovering);
	else world.remove(IsDevtoolsHovering);

	if (anySelected) world.add(IsDevtoolsSelecting);
	else world.remove(IsDevtoolsSelecting);

	if (anyHovered || anySelected) world.add(IsDevtoolsHighlighting);
	else world.remove(IsDevtoolsHighlighting);
}
