import { createRemoved, type Entity, type World } from '@koota/core';
import {
	IsDevtoolsHighlighting,
	IsDevtoolsHovered,
	IsDevtoolsHovering,
	IsDevtoolsSelected,
	IsDevtoolsSelecting,
} from '../../traits';

const Removed = createRemoved();

/**
 * Per-frame system that:
 * 1. Syncs world highlight tags based on current entity trait state
 * 2. Clears selection state when selected entity is destroyed
 */
export function runDevtoolsHighlightSystem(
	world: World,
	previousSelectedEntityRef: React.MutableRefObject<Entity | null>,
	setSelectedEntity: (entity: Entity | null) => void
) {
	// Check for removed selected entities (handles entity destruction)
	const removedSelected = world.query(Removed(IsDevtoolsSelected));
	for (const entity of removedSelected) {
		if (previousSelectedEntityRef.current === entity) {
			previousSelectedEntityRef.current = null;
			setSelectedEntity(null);
		}
	}

	// Sync world highlight tags based on current state
	const anyHovered = world.query(IsDevtoolsHovered).length > 0;
	const anySelected = world.query(IsDevtoolsSelected).length > 0;

	if (anyHovered) world.add(IsDevtoolsHovering);
	else world.remove(IsDevtoolsHovering);

	if (anySelected) world.add(IsDevtoolsSelecting);
	else world.remove(IsDevtoolsSelecting);

	if (anyHovered || anySelected) world.add(IsDevtoolsHighlighting);
	else world.remove(IsDevtoolsHighlighting);
}
