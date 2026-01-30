import { beforeEach, describe, expect, it } from 'vitest';
import { Position, Rotation, Scale, Color, EditingPosition, StableId } from '../src/core/traits';
import { editingActions } from '../src/core/actions/editing-actions';
import { applyCheckpoint } from '../src/core/multiplayer/checkpoint';
import { createTestWorld, createLocalUser, createShape } from './utils/test-helpers';

describe('Checkpoint rebase', () => {
    let world: ReturnType<typeof createTestWorld>;

    beforeEach(() => {
        world = createTestWorld();
    });

    it('should preserve entity handle during rebase', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const entityBefore = shape;

        applyCheckpoint(world, {
            seq: 1,
            shapes: [
                {
                    id: stableId,
                    type: 'rect',
                    x: 150,
                    y: 250,
                    rotation: 0,
                    scaleX: 1,
                    scaleY: 1,
                    color: { r: 74, g: 144, b: 217 },
                },
            ],
        });

        // Same entity handle should still be alive
        expect(entityBefore.isAlive()).toBe(true);
        // Position should be updated from checkpoint
        expect(entityBefore.get(Position)).toMatchObject({ x: 150, y: 250 });
    });

    it('should preserve live position and update durable when locally editing', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const editor = createLocalUser(world);
        const actions = editingActions(world);

        // Start editing and move to new position
        actions.startEditing(shape, ['position'], editor);
        shape.set(Position, { x: 300, y: 400 });

        // Checkpoint arrives with different position
        applyCheckpoint(world, {
            seq: 2,
            shapes: [
                {
                    id: stableId,
                    type: 'rect',
                    x: 500,
                    y: 600,
                    rotation: 0,
                    scaleX: 1,
                    scaleY: 1,
                    color: { r: 74, g: 144, b: 217 },
                },
            ],
        });

        // Live position preserved, durable updated to checkpoint
        expect(shape.get(Position)).toMatchObject({ x: 300, y: 400 });
        expect(shape.get(EditingPosition)).toMatchObject({ durableX: 500, durableY: 600 });
    });

    it('should update non-editing properties from checkpoint', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const editor = createLocalUser(world);
        const actions = editingActions(world);

        // Only editing position
        actions.startEditing(shape, ['position'], editor);

        // Checkpoint changes color and rotation (not being edited)
        applyCheckpoint(world, {
            seq: 1,
            shapes: [
                {
                    id: stableId,
                    type: 'rect',
                    x: 100,
                    y: 200,
                    rotation: 45,
                    scaleX: 2,
                    scaleY: 2,
                    color: { r: 255, g: 0, b: 0 },
                },
            ],
        });

        // Non-edited properties should update
        expect(shape.get(Rotation)).toMatchObject({ angle: 45 });
        expect(shape.get(Scale)).toMatchObject({ x: 2, y: 2 });
        expect(shape.get(Color)).toMatchObject({ r: 255, g: 0, b: 0 });
    });

    it('should spawn new shapes from checkpoint', () => {
        const existingShape = createShape(world, { x: 100, y: 200 });
        const existingId = existingShape.get(StableId)!.id;

        applyCheckpoint(world, {
            seq: 1,
            shapes: [
                {
                    id: existingId,
                    type: 'rect',
                    x: 100,
                    y: 200,
                    rotation: 0,
                    scaleX: 1,
                    scaleY: 1,
                    color: { r: 74, g: 144, b: 217 },
                },
                {
                    id: 999,
                    type: 'ellipse',
                    x: 50,
                    y: 50,
                    rotation: 0,
                    scaleX: 1,
                    scaleY: 1,
                    color: { r: 0, g: 255, b: 0 },
                },
            ],
        });

        // Existing shape preserved
        expect(existingShape.isAlive()).toBe(true);

        // New shape created
        const newShape = world.queryFirst(StableId);
        expect(newShape).toBeDefined();
    });

    it('should destroy shapes not in checkpoint', () => {
        const shape1 = createShape(world, { x: 100, y: 200 });
        const shape2 = createShape(world, { x: 300, y: 400 });
        const id1 = shape1.get(StableId)!.id;

        // Checkpoint only includes shape1
        applyCheckpoint(world, {
            seq: 1,
            shapes: [
                {
                    id: id1,
                    type: 'rect',
                    x: 100,
                    y: 200,
                    rotation: 0,
                    scaleX: 1,
                    scaleY: 1,
                    color: { r: 74, g: 144, b: 217 },
                },
            ],
        });

        expect(shape1.isAlive()).toBe(true);
        expect(shape2.isAlive()).toBe(false);
    });
});
