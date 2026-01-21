import type { World } from 'koota';
import { Color, History, Position, Rotation, Scale, Shape, StableId, IsSelected } from '../traits';
import type { Checkpoint } from './protocol';

export function createCheckpoint(world: World, seq: number): Checkpoint {
    const shapes = world
        .query(StableId, Shape, Position, Rotation, Scale, Color)
        .map(([id, shape, pos, rot, scale, color]) => ({
            id: id.id,
            type: shape.type,
            x: pos.x,
            y: pos.y,
            rotation: rot.angle,
            scaleX: scale.x,
            scaleY: scale.y,
            color: color.fill,
        }))
        .sort((a, b) => a.id - b.id);

    return { seq, shapes };
}

export function applyCheckpoint(world: World, checkpoint: Checkpoint) {
    const history = world.get(History)!;

    const selectedIds = world
        .query(IsSelected, StableId)
        .map(([, id]) => id.id);

    for (const entity of history.entities.values()) {
        if (entity.isAlive()) {
            entity.destroy();
        }
    }
    history.entities.clear();
    world.set(History, history);

    for (const shape of checkpoint.shapes) {
        const entity = world.spawn(
            StableId({ id: shape.id }),
            Shape({ type: shape.type }),
            Position({ x: shape.x, y: shape.y }),
            Rotation({ angle: shape.rotation }),
            Scale({ x: shape.scaleX, y: shape.scaleY }),
            Color({ fill: shape.color })
        );
        history.entities.set(shape.id, entity);
    }

    world.set(History, {
        ...history,
        nextSeq: Math.max(history.nextSeq, checkpoint.seq + 1),
    });

    for (const id of selectedIds) {
        const entity = history.entities.get(id);
        if (entity && entity.isAlive()) {
            entity.add(IsSelected);
        }
    }
}
