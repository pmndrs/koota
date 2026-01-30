import type { World } from 'koota';
import { Color, History, IsSelected, Position, Rotation, Scale, Shape, StableId } from '../traits';
import type { Checkpoint } from './protocol';

export function createCheckpoint(world: World, seq: number): Checkpoint {
    const shapes: Checkpoint['shapes'] = [];
    world
        .query(StableId, Shape, Position, Rotation, Scale, Color)
        .readEach(([id, shape, pos, rot, scale, color]) => {
            shapes.push({
                id: id.id,
                type: shape.type,
                x: pos.x,
                y: pos.y,
                rotation: rot.angle,
                scaleX: scale.x,
                scaleY: scale.y,
                color: { r: color.r, g: color.g, b: color.b },
            });
        });

    return { seq, shapes: shapes.sort((a, b) => a.id - b.id) };
}

export function applyCheckpoint(world: World, checkpoint: Checkpoint) {
    const history = world.get(History)!;

    const selectedIds: number[] = [];
    world.query(IsSelected, StableId).readEach(([id]) => {
        selectedIds.push(id.id);
    });

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
            Color({ r: shape.color.r, g: shape.color.g, b: shape.color.b })
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
