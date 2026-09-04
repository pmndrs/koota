import type { Entity } from 'koota';
import { IsDevtoolsHovered, IsDevtoolsHovering, IsDevtoolsSelected } from 'koota/devtools';
import { useTag, useWorld } from 'koota/react';

// Pure cyan and magenta sit far from the white, orange and red wireframes in
// the scene, so a highlight reads at a glance on the dark background.
const HOVERED_COLOR = '#00ffff';
const SELECTED_COLOR = '#ff00ff';

export function useDevtoolsHighlight(entity: Entity) {
  const world = useWorld();
  const isHovered = useTag(entity, IsDevtoolsHovered);
  const isSelected = useTag(entity, IsDevtoolsSelected);
  const isAnythingHovered = useTag(world, IsDevtoolsHovering);

  const shouldFade = isAnythingHovered && !isSelected && !isHovered;

  return {
    isHovered,
    isSelected,
    color: isSelected ? SELECTED_COLOR : isHovered ? HOVERED_COLOR : null,
    opacity: shouldFade ? 0.15 : 1,
  };
}
