import { trait } from '@koota/core';

/**
 * Tag trait added to entities when they are hovered in the devtools UI.
 * Apps can query this to show visual feedback.
 */
export const IsDevtoolsHovered = trait();

/**
 * Tag trait added to entities when they are selected in the devtools UI.
 * Apps can query this to show visual feedback.
 */
export const IsDevtoolsSelected = trait();

/**
 * Tag trait added to the world when any entity is being hovered in the devtools UI.
 */
export const IsDevtoolsHovering = trait();

/**
 * Tag trait added to the world when any entity is selected in the devtools UI.
 */
export const IsDevtoolsSelecting = trait();

/**
 * Tag trait added to the world when any entity is hovered or selected in the devtools UI.
 * Combines IsDevtoolsHovering and IsDevtoolsSelecting for convenience.
 */
export const IsDevtoolsHighlighting = trait();
