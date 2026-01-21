import { useActions } from 'koota/react';
import { useCallback, useEffect } from 'react';
import { actions } from '../core/actions';
import { ShapeRenderer } from './shapes/shape-renderer';

export function Canvas() {
    const { clearSelection, deleteSelected, undo, redo } = useActions(actions);

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            // Only clear selection if clicking directly on the canvas (not a shape)
            if (event.target === event.currentTarget) {
                clearSelection();
            }
        },
        [clearSelection]
    );

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
        <div className="canvas" onPointerDown={handlePointerDown}>
            <ShapeRenderer />
        </div>
    );
}
