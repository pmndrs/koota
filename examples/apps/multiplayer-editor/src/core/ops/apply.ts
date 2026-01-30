import type { World } from 'koota';
import type { Op } from '../types';
import { OpCode } from '../types';
import {
    Shape,
    Position,
    Rotation,
    Scale,
    Color,
    History,
    StableId,
    IsTombstoned,
    EditingPosition,
    EditingRotation,
    EditingScale,
    EditingColor,
    EditedBy,
    IsSelected,
    Dragging,
} from '../traits';
import { isActive } from '../utils/shape-helpers';
import { isLocallyEditing } from '../utils/editing-helpers';

/**
 * Apply an op to the world.
 *
 * For update ops, if the entity is being locally edited for that property,
 * the op updates durable state instead of live state. This prevents remote
 * updates from interrupting the user's interaction.
 */
export function applyOp(world: World, op: Op): void {
    const history = world.get(History)!;

    switch (op.op) {
        case OpCode.CreateShape: {
            const existing = history.entities.get(op.id);
            if (existing && existing.isAlive()) {
                if (existing.has(IsTombstoned)) {
                    existing.remove(IsTombstoned);
                }
                if (!existing.has(StableId)) {
                    existing.add(StableId({ id: op.id }));
                }
                if (!existing.has(Shape)) {
                    existing.add(Shape({ type: op.shape }));
                } else {
                    existing.set(Shape, { type: op.shape });
                }
                existing.set(Position, { x: op.x, y: op.y });
                existing.set(Rotation, { angle: op.rotation });
                existing.set(Scale, { x: op.scaleX, y: op.scaleY });
                existing.set(Color, { r: op.color.r, g: op.color.g, b: op.color.b });
            } else {
                const entity = world.spawn(
                    StableId({ id: op.id }),
                    Shape({ type: op.shape }),
                    Position({ x: op.x, y: op.y }),
                    Rotation({ angle: op.rotation }),
                    Scale({ x: op.scaleX, y: op.scaleY }),
                    Color({ r: op.color.r, g: op.color.g, b: op.color.b })
                );
                history.entities.set(op.id, entity);
            }
            break;
        }

        case OpCode.DeleteShape: {
            const entity = history.entities.get(op.id);
            if (entity && entity.isAlive()) {
                if (!entity.has(IsTombstoned)) {
                    entity.add(IsTombstoned);
                }
                entity.remove(IsSelected);
                entity.remove(Dragging);
                entity.remove(EditingPosition);
                entity.remove(EditingRotation);
                entity.remove(EditingScale);
                entity.remove(EditingColor);
                for (const editor of entity.targetsFor(EditedBy)) {
                    entity.remove(EditedBy(editor));
                }
            }
            break;
        }

        case OpCode.UpdatePosition: {
            const entity = history.entities.get(op.id);
            if (!isActive(entity)) break;

            if (isLocallyEditing(entity) && entity.has(EditingPosition)) {
                // Update durable, preserve live
                const editing = entity.get(EditingPosition)!;
                entity.set(EditingPosition, { ...editing, durableX: op.x, durableY: op.y });
            } else {
                entity.set(Position, { x: op.x, y: op.y });
            }
            break;
        }

        case OpCode.UpdateRotation: {
            const entity = history.entities.get(op.id);
            if (!isActive(entity)) break;

            if (isLocallyEditing(entity) && entity.has(EditingRotation)) {
                const editing = entity.get(EditingRotation)!;
                entity.set(EditingRotation, { ...editing, durableAngle: op.angle });
            } else {
                entity.set(Rotation, { angle: op.angle });
            }
            break;
        }

        case OpCode.UpdateScale: {
            const entity = history.entities.get(op.id);
            if (!isActive(entity)) break;

            if (isLocallyEditing(entity) && entity.has(EditingScale)) {
                const editing = entity.get(EditingScale)!;
                entity.set(EditingScale, { ...editing, durableX: op.x, durableY: op.y });
            } else {
                entity.set(Scale, { x: op.x, y: op.y });
            }
            break;
        }

        case OpCode.UpdateColor: {
            const entity = history.entities.get(op.id);
            if (!isActive(entity)) break;

            if (isLocallyEditing(entity) && entity.has(EditingColor)) {
                const editing = entity.get(EditingColor)!;
                entity.set(EditingColor, {
                    ...editing,
                    durableR: op.r,
                    durableG: op.g,
                    durableB: op.b,
                });
            } else {
                entity.set(Color, { r: op.r, g: op.g, b: op.b });
            }
            break;
        }
    }
}
