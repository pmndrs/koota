import { beforeEach, describe, expect, it } from 'vitest';
import { Position, Rotation, Scale, Color, EditingPosition, StableId } from '../src/core/traits';
import { OpCode } from '../src/core/types';
import { editingActions } from '../src/core/actions/editing-actions';
import { applyOp } from '../src/core/ops/apply';
import { createTestWorld, createLocalUser, createShape } from './utils/test-helpers';

describe('applyOp - edit-aware updates', () => {
    let world: ReturnType<typeof createTestWorld>;

    beforeEach(() => {
        world = createTestWorld();
    });

    it('should update live position when not editing', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;

        applyOp(world, {
            op: OpCode.UpdatePosition,
            id: stableId,
            seq: 1,
            x: 300,
            y: 400,
            prevX: 100,
            prevY: 200,
        });

        expect(shape.get(Position)).toMatchObject({ x: 300, y: 400 });
    });

    it('should update durable position when locally editing', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const editor = createLocalUser(world);
        const actions = editingActions(world);

        // Start editing and move
        actions.startEditing(shape, ['position'], editor);
        shape.set(Position, { x: 150, y: 250 });

        // Remote op arrives
        applyOp(world, {
            op: OpCode.UpdatePosition,
            id: stableId,
            seq: 1,
            x: 500,
            y: 600,
            prevX: 100,
            prevY: 200,
        });

        // Live preserved, durable updated
        expect(shape.get(Position)).toMatchObject({ x: 150, y: 250 });
        expect(shape.get(EditingPosition)).toMatchObject({ durableX: 500, durableY: 600 });
    });

    it('should update live rotation when not editing', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;

        applyOp(world, {
            op: OpCode.UpdateRotation,
            id: stableId,
            seq: 1,
            angle: 45,
            prevAngle: 0,
        });

        expect(shape.get(Rotation)).toMatchObject({ angle: 45 });
    });

    it('should update live scale when not editing', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;

        applyOp(world, {
            op: OpCode.UpdateScale,
            id: stableId,
            seq: 1,
            x: 2,
            y: 3,
            prevX: 1,
            prevY: 1,
        });

        expect(shape.get(Scale)).toMatchObject({ x: 2, y: 3 });
    });

    it('should update live color when not editing', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;

        applyOp(world, {
            op: OpCode.UpdateColor,
            id: stableId,
            seq: 1,
            r: 255,
            g: 0,
            b: 0,
            prevR: 74,
            prevG: 144,
            prevB: 217,
        });

        expect(shape.get(Color)).toMatchObject({ r: 255, g: 0, b: 0 });
    });

    it('should allow non-edited properties to update live while editing another', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const editor = createLocalUser(world);
        const actions = editingActions(world);

        // Only editing position
        actions.startEditing(shape, ['position'], editor);

        // Color op should update live (not editing color)
        applyOp(world, {
            op: OpCode.UpdateColor,
            id: stableId,
            seq: 1,
            r: 255,
            g: 0,
            b: 0,
            prevR: 74,
            prevG: 144,
            prevB: 217,
        });

        expect(shape.get(Color)).toMatchObject({ r: 255, g: 0, b: 0 });
    });
});
