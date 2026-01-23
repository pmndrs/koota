import { createActions, type Entity } from 'koota';
import { Color, History, Position, Rotation, Scale, Shape, StableId } from '../traits';
import { historyActions } from './history-actions';
import { OpCode, SEQ_UNASSIGNED } from '../ops/types';

export const shapeActions = createActions((world) => {
    const { push, commit } = historyActions(world);

    return {
        addShape: (type: 'rect' | 'ellipse', x: number, y: number): Entity => {
            const historyTrait = world.get(History)!;
            const color = '#4a90d9';
            const rotation = 0;
            const scaleX = 1;
            const scaleY = 1;

            // Assign stable ID
            const id = historyTrait.idBase + historyTrait.nextId++;

            const entity = world.spawn(
                StableId({ id }),
                Shape({ type }),
                Position({ x, y }),
                Rotation({ angle: rotation }),
                Scale({ x: scaleX, y: scaleY }),
                Color({ fill: color })
            );

            // Register entity in map
            historyTrait.entities.set(id, entity);

            push({
                op: OpCode.CreateShape,
                id,
                seq: SEQ_UNASSIGNED,
                shape: type,
                x,
                y,
                color,
                rotation,
                scaleX,
                scaleY,
            });
            commit(); // Immediate commit for discrete actions

            return entity;
        },
    };
});
