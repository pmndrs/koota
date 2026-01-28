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

export function applyOp(world: World, op: Op): void {
    const history = world.get(History)!;

    switch (op.op) {
        case OpCode.CreateShape: {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/49ce6d5d-d793-4697-b0bb-8d91097dbd1f', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    location: 'apply.ts:11',
                    message: 'applyOp CreateShape',
                    data: { seq: op.seq, id: op.id, entityExists: history.entities.has(op.id) },
                    timestamp: Date.now(),
                    sessionId: 'debug-session',
                    hypothesisId: 'C',
                }),
            }).catch(() => {});
            // #endregion
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
                existing.set(Color, { fill: op.color });
            } else {
                const entity = world.spawn(
                    StableId({ id: op.id }),
                    Shape({ type: op.shape }),
                    Position({ x: op.x, y: op.y }),
                    Rotation({ angle: op.rotation }),
                    Scale({ x: op.scaleX, y: op.scaleY }),
                    Color({ fill: op.color })
                );
                history.entities.set(op.id, entity);
            }
            break;
        }

        case OpCode.DeleteShape: {
            const entity = history.entities.get(op.id);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/49ce6d5d-d793-4697-b0bb-8d91097dbd1f', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    location: 'apply.ts:29',
                    message: 'applyOp DeleteShape',
                    data: {
                        seq: op.seq,
                        id: op.id,
                        entityExists: !!entity,
                        entityIsAlive: entity?.isAlive(),
                    },
                    timestamp: Date.now(),
                    sessionId: 'debug-session',
                    hypothesisId: 'C',
                }),
            }).catch(() => {});
            // #endregion
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
            if (
                entity &&
                entity.isAlive() &&
                !entity.has(IsTombstoned) &&
                entity.has(Position)
            ) {
                entity.set(Position, { x: op.x, y: op.y });
            }
            break;
        }

        case OpCode.UpdateRotation: {
            const entity = history.entities.get(op.id);
            if (
                entity &&
                entity.isAlive() &&
                !entity.has(IsTombstoned) &&
                entity.has(Rotation)
            ) {
                entity.set(Rotation, { angle: op.angle });
            }
            break;
        }

        case OpCode.UpdateScale: {
            const entity = history.entities.get(op.id);
            if (
                entity &&
                entity.isAlive() &&
                !entity.has(IsTombstoned) &&
                entity.has(Scale)
            ) {
                entity.set(Scale, { x: op.x, y: op.y });
            }
            break;
        }

        case OpCode.UpdateColor: {
            const entity = history.entities.get(op.id);
            if (
                entity &&
                entity.isAlive() &&
                !entity.has(IsTombstoned) &&
                entity.has(Color)
            ) {
                entity.set(Color, { fill: op.fill });
            }
            break;
        }
    }
}
