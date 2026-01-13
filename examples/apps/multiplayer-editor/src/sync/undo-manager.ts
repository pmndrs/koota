import type { Op } from '../shared/protocol';

export interface UndoEntry {
    original: Op;
    inverse: Op;
}

export interface UndoGroup {
    gestureId: string;
    entries: UndoEntry[];
}

export interface UndoManager {
    push: (entry: UndoEntry) => void;
    undo: () => UndoEntry[] | null;
    redo: () => UndoEntry[] | null;
    canUndo: () => boolean;
    canRedo: () => boolean;
    clear: () => void;
}

export function createUndoManager(): UndoManager {
    const undoStack: UndoGroup[] = [];
    const redoStack: UndoGroup[] = [];

    return {
        push(entry: UndoEntry) {
            // Clear redo on new action
            redoStack.length = 0;

            const gestureId = entry.original.gestureId || entry.original.id;

            // Check if we can merge with the last group (same gestureId)
            const lastGroup = undoStack[undoStack.length - 1];
            if (lastGroup && lastGroup.gestureId === gestureId) {
                lastGroup.entries.push(entry);
            } else {
                undoStack.push({ gestureId, entries: [entry] });
            }

            // Limit stack size
            if (undoStack.length > 100) {
                undoStack.shift();
            }
        },

        undo(): UndoEntry[] | null {
            const group = undoStack.pop();
            if (!group) return null;
            redoStack.push(group);
            return group.entries;
        },

        redo(): UndoEntry[] | null {
            const group = redoStack.pop();
            if (!group) return null;
            undoStack.push(group);
            return group.entries;
        },

        canUndo() {
            return undoStack.length > 0;
        },

        canRedo() {
            return redoStack.length > 0;
        },

        clear() {
            undoStack.length = 0;
            redoStack.length = 0;
        },
    };
}
