import { beforeEach, describe, expect, it } from 'vitest';
import { Position, EditingPosition } from '../src/core/traits';
import { editingActions } from '../src/core/actions/editing-actions';
import { createTestWorld, createLocalUser, createShape } from './utils/test-helpers';

describe('Editing actions', () => {
    let world: ReturnType<typeof createTestWorld>;

    beforeEach(() => {
        world = createTestWorld();
    });

    it('should capture durable state when starting edit', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const editor = createLocalUser(world);
        const actions = editingActions(world);

        actions.startEditing(shape, ['position'], editor);

        expect(shape.has(EditingPosition)).toBe(true);
        expect(shape.get(EditingPosition)).toMatchObject({ durableX: 100, durableY: 200 });
    });

    it('should restore to durable state when cancelled', () => {
        const shape = createShape(world, { x: 100, y: 200 });
        const editor = createLocalUser(world);
        const actions = editingActions(world);

        actions.startEditing(shape, ['position'], editor);
        shape.set(Position, { x: 300, y: 400 });

        actions.cancelEditing(shape);

        expect(shape.get(Position)).toMatchObject({ x: 100, y: 200 });
        expect(shape.has(EditingPosition)).toBe(false);
    });
});
