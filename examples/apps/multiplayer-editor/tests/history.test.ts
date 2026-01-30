import { beforeEach, describe, expect, it } from 'vitest';
import { Scale, EditingScale } from '../src/core/traits';
import { editingActions } from '../src/core/actions/editing-actions';
import { historyActions } from '../src/core/actions/history-actions';
import { createTestWorld, createLocalUser, createShape } from './utils/test-helpers';

describe('History actions', () => {
    let world: ReturnType<typeof createTestWorld>;

    beforeEach(() => {
        world = createTestWorld();
    });

    it('should undo uniform scale change in a single operation', () => {
        const shape = createShape(world, { x: 100, y: 100, scaleX: 1, scaleY: 1 });
        const editor = createLocalUser(world);
        const editing = editingActions(world);
        const history = historyActions(world);

        // Start editing scale
        editing.startEditing(shape, ['scale'], editor);
        expect(shape.has(EditingScale)).toBe(true);

        // Change scale uniformly (both x and y)
        shape.set(Scale, { x: 2, y: 2 });

        // Commit the change
        editing.commitEditing(shape, ['scale']);

        // Verify the scale was changed
        expect(shape.get(Scale)).toMatchObject({ x: 2, y: 2 });

        // Undo the change
        history.undo();

        // Both x and y should be restored
        expect(shape.get(Scale)).toMatchObject({ x: 1, y: 1 });
    });
});
