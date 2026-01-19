import type { World } from 'koota';
import type { Op } from './types';
import { OpCode } from './types';
import { Shape, Position, Rotation, Scale, Color, History, StableId } from '../traits';

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
            if (!history.entities.has(op.id)) {
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
                entity.destroy();
                history.entities.delete(op.id);
            }
            break;
        }

        case OpCode.UpdatePosition: {
            const entity = history.entities.get(op.id);
            if (entity && entity.isAlive() && entity.has(Position)) {
                entity.set(Position, { x: op.x, y: op.y });
            }
            break;
        }

        case OpCode.UpdateRotation: {
            const entity = history.entities.get(op.id);
            if (entity && entity.isAlive() && entity.has(Rotation)) {
                entity.set(Rotation, { angle: op.angle });
            }
            break;
        }

        case OpCode.UpdateScale: {
            const entity = history.entities.get(op.id);
            if (entity && entity.isAlive() && entity.has(Scale)) {
                entity.set(Scale, { x: op.x, y: op.y });
            }
            break;
        }

        case OpCode.UpdateColor: {
            const entity = history.entities.get(op.id);
            if (entity && entity.isAlive() && entity.has(Color)) {
                entity.set(Color, { fill: op.fill });
            }
            break;
        }
    }
}
