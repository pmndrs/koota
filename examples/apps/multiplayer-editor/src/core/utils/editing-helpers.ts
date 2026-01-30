import type { Entity } from 'koota';
import { EditedBy, IsLocal } from '../traits';

/** Check if entity is being edited by the local user */
export function isLocallyEditing(entity: Entity): boolean {
    return entity.targetsFor(EditedBy).some((editor) => editor.has(IsLocal));
}
