import { useActions, useWorld } from 'koota/react';
import { useCallback, useEffect } from 'react';
import { historyActions, selectionActions } from '../core/actions';
import { ShapeRenderer } from './shapes/shape-renderer';
import { clearCanvasPointer, syncCanvasPointer } from '../core/systems/sync-canvas-pointer';

export function Canvas() {
    const world = useWorld();
    const { clearSelection, deleteSelected } = useActions(selectionActions);
    const { undo, redo } = useActions(historyActions);

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            // Only clear selection if clicking directly on the canvas (not a shape)
            if (event.target === event.currentTarget) {
                clearSelection();
            }
        },
        [clearSelection]
    );

    const handlePointerMove = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            syncCanvasPointer(world, { x: event.clientX, y: event.clientY });
        },
        [world]
    );

    const handlePointerLeave = useCallback(() => {
        clearCanvasPointer(world);
    }, [world]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Undo/Redo
            if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
                event.preventDefault();
                if (event.shiftKey) {
                    redo();
                } else {
                    undo();
                }
                return;
            }

            // Redo (Ctrl+Y)
            if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
                event.preventDefault();
                redo();
                return;
            }

            // Other shortcuts
            if (event.key === 'Escape') {
                clearSelection();
            } else if (event.key === 'Backspace' || event.key === 'Delete') {
                deleteSelected();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [clearSelection, deleteSelected, undo, redo]);

    return (
        <div
            className="canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
        >
            <ShapeRenderer />
        </div>
    );
}
