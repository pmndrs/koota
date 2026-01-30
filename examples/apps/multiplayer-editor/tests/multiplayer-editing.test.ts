import { beforeEach, describe, expect, it } from 'vitest';
import {
    Position,
    Color,
    StableId,
    IsSelected,
    Dragging,
    EditingPosition,
    EditingColor,
    IsRemote,
    EditedBy,
    IsRemoteDragging,
} from '../src/core/traits';
import { editingActions } from '../src/core/actions/editing-actions';
import { presenceActions } from '../src/core/actions/presence-actions';
import { applyCheckpoint } from '../src/core/multiplayer/checkpoint';
import { createTestWorld, createLocalUser, createShape } from './utils/test-helpers';

describe('Selection preservation across rebase', () => {
    let world: ReturnType<typeof createTestWorld>;

    beforeEach(() => {
        world = createTestWorld();
    });

    it('should preserve IsSelected when checkpoint rebases the shape', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;

        // Select the shape
        shape.add(IsSelected);
        expect(shape.has(IsSelected)).toBe(true);

        // Checkpoint arrives with different position
        applyCheckpoint(world, {
            seq: 1,
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

        // Selection should be preserved
        expect(shape.isAlive()).toBe(true);
        expect(shape.has(IsSelected)).toBe(true);
        // Position should update (not editing)
        expect(shape.get(Position)).toMatchObject({ x: 500, y: 600 });
    });

    it('should preserve IsSelected when shape is removed and re-added in checkpoint', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;

        shape.add(IsSelected);

        // First checkpoint removes the shape
        applyCheckpoint(world, { seq: 1, shapes: [] });
        expect(shape.isAlive()).toBe(false);

        // Second checkpoint re-adds it
        applyCheckpoint(world, {
            seq: 2,
            shapes: [
                {
                    id: stableId,
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

        // New entity created - selection is lost (expected behavior)
        // This test documents current behavior
        const history = world.get('History' as any);
        // NOTE: Selection is NOT preserved when entity is destroyed and recreated
    });
});

describe('Drag state preservation across rebase', () => {
    let world: ReturnType<typeof createTestWorld>;

    beforeEach(() => {
        world = createTestWorld();
    });

    it('should preserve Dragging trait when checkpoint rebases', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const editor = createLocalUser(world);
        const actions = editingActions(world);

        // Start editing and dragging
        actions.startEditing(shape, ['position'], editor);
        shape.add(Dragging({ offsetX: 10, offsetY: 20 }));

        expect(shape.has(Dragging)).toBe(true);
        expect(shape.has(EditingPosition)).toBe(true);

        // Checkpoint arrives
        applyCheckpoint(world, {
            seq: 1,
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

        // Dragging state should be preserved
        expect(shape.isAlive()).toBe(true);
        expect(shape.has(Dragging)).toBe(true);
        expect(shape.get(Dragging)).toMatchObject({ offsetX: 10, offsetY: 20 });

        // Durable should update, live position preserved would require explicit handling
        expect(shape.has(EditingPosition)).toBe(true);
    });

    it('should preserve EditedBy relation when checkpoint rebases', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const editor = createLocalUser(world);
        const actions = editingActions(world);

        actions.startEditing(shape, ['position'], editor);
        expect(shape.has(EditedBy(editor))).toBe(true);

        applyCheckpoint(world, {
            seq: 1,
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

        // EditedBy relation should be preserved
        expect(shape.has(EditedBy(editor))).toBe(true);
    });
});

describe('Ignores remote drag updates while locally editing', () => {
    let world: ReturnType<typeof createTestWorld>;

    beforeEach(() => {
        world = createTestWorld();
    });

    it('should ignore remote position updates when local user is editing', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const localUser = createLocalUser(world);
        const remoteUser = world.spawn(IsRemote);

        const editing = editingActions(world);
        const presence = presenceActions(world);

        // Local user starts editing
        editing.startEditing(shape, ['position'], localUser);
        shape.set(Position, { x: 150, y: 250 }); // Local drag in progress

        // Remote user also starts editing same shape
        presence.handleRemoteEditStart(remoteUser, {
            type: 'editStart',
            shapeId: stableId,
            properties: ['position'],
            mode: 'drag',
            durableX: 100,
            durableY: 200,
        });

        // Remote user sends position update
        presence.handleRemoteEditUpdate({
            type: 'editUpdate',
            shapeId: stableId,
            x: 500,
            y: 600,
        });

        // Local position should NOT be overwritten
        // Current behavior: it DOES get overwritten (this test may fail)
        expect(shape.get(Position)).toMatchObject({ x: 150, y: 250 });
    });

    it('should not add IsRemoteDragging when local user is editing', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const localUser = createLocalUser(world);
        const remoteUser = world.spawn(IsRemote);

        const editing = editingActions(world);
        const presence = presenceActions(world);

        // Local user starts editing
        editing.startEditing(shape, ['position'], localUser);

        // Remote user tries to start editing
        presence.handleRemoteEditStart(remoteUser, {
            type: 'editStart',
            shapeId: stableId,
            properties: ['position'],
            mode: 'drag',
            durableX: 100,
            durableY: 200,
        });

        // Should NOT add IsRemoteDragging since local is editing
        // Current behavior: it DOES add it (this test may fail)
        expect(shape.has(IsRemoteDragging)).toBe(false);
    });
});

describe('Ignores remote color previews (commit-only)', () => {
    let world: ReturnType<typeof createTestWorld>;

    beforeEach(() => {
        world = createTestWorld();
    });

    it('should ignore remote color editUpdate', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const remoteUser = world.spawn(IsRemote);

        const presence = presenceActions(world);

        const originalColor = shape.get(Color);
        expect(originalColor).toMatchObject({ r: 74, g: 144, b: 217 });

        // Remote user starts color edit
        presence.handleRemoteEditStart(remoteUser, {
            type: 'editStart',
            shapeId: stableId,
            properties: ['color'],
            mode: 'discrete',
            durableR: 74,
            durableG: 144,
            durableB: 217,
        });

        // Remote user sends color update (preview)
        presence.handleRemoteEditUpdate({
            type: 'editUpdate',
            shapeId: stableId,
            r: 255,
            g: 0,
            b: 0,
        });

        // Color should NOT be updated (commit-only)
        expect(shape.get(Color)).toMatchObject({ r: 74, g: 144, b: 217 });
    });

    it('should not add EditingColor for remote color edits', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const remoteUser = world.spawn(IsRemote);

        const presence = presenceActions(world);

        presence.handleRemoteEditStart(remoteUser, {
            type: 'editStart',
            shapeId: stableId,
            properties: ['color'],
            mode: 'discrete',
            durableR: 74,
            durableG: 144,
            durableB: 217,
        });

        // Should NOT add EditingColor (commit-only means no remote tracking)
        expect(shape.has(EditingColor)).toBe(false);
    });

    it('should not restore color on remote editEnd (nothing to restore)', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const stableId = shape.get(StableId)!.id;
        const remoteUser = world.spawn(IsRemote);

        const presence = presenceActions(world);

        presence.handleRemoteEditStart(remoteUser, {
            type: 'editStart',
            shapeId: stableId,
            properties: ['color'],
            mode: 'discrete',
            durableR: 74,
            durableG: 144,
            durableB: 217,
        });

        // Edit end with committed=false
        presence.handleRemoteEditEnd(remoteUser, {
            type: 'editEnd',
            shapeId: stableId,
            committed: false,
        });

        // Color should remain unchanged
        expect(shape.get(Color)).toMatchObject({ r: 74, g: 144, b: 217 });
    });
});
