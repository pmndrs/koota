import { createActions, type Entity } from 'koota';
import {
    Color,
    IsSelected,
    Position,
    Rotation,
    Scale,
    Shape,
    StableId,
    IsTombstoned,
    Dragging,
    EditedBy,
} from '../traits';
import { historyActions } from './history-actions';
import { editingActions } from './editing-actions';
import { OpCode, SEQ_UNASSIGNED } from '../types';
import { isActive } from '../utils/shape-helpers';

export const selectionActions = createActions((world) => {
    const { push, commit } = historyActions(world);

    return {
        selectShape: (entity: Entity, additive = false) => {
            if (!isActive(entity)) return;
            if (additive) {
                // Shift-click: toggle selection for multi-select
                if (entity.has(IsSelected)) {
                    entity.remove(IsSelected);
                } else {
                    entity.add(IsSelected);
                }
            } else {
                // Regular click: select this shape, clear others
                for (const selected of world.query(IsSelected)) {
                    if (selected.id() !== entity.id()) {
                        selected.remove(IsSelected);
                    }
                }
                // Ensure this entity is selected (don't toggle)
                if (!entity.has(IsSelected)) {
                    entity.add(IsSelected);
                }
            }
        },

        clearSelection: () => {
            for (const entity of world.query(IsSelected)) {
                entity.remove(IsSelected);
            }
        },

        deleteSelected: () => {
            const selected = Array.from(world.query(IsSelected));
            const editing = editingActions(world);

            for (const entity of selected) {
                if (!isActive(entity)) continue;
                const stableId = entity.get(StableId);
                const shape = entity.get(Shape);
                const position = entity.get(Position);
                const rotation = entity.get(Rotation);
                const scale = entity.get(Scale);
                const color = entity.get(Color);

                if (stableId && shape && position && rotation && scale && color) {
                    editing.finishEditing(entity);
                    push({
                        op: OpCode.DeleteShape,
                        id: stableId.id,
                        seq: SEQ_UNASSIGNED,
                        shape: shape.type,
                        x: position.x,
                        y: position.y,
                        color: { r: color.r, g: color.g, b: color.b },
                        rotation: rotation.angle,
                        scaleX: scale.x,
                        scaleY: scale.y,
                    });
                    entity.add(IsTombstoned);
                    entity.remove(IsSelected);
                    entity.remove(Dragging);
                    for (const editor of entity.targetsFor(EditedBy)) {
                        entity.remove(EditedBy(editor));
                    }
                }
            }
            commit();
        },
    };
});
