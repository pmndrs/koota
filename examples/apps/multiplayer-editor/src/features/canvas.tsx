import { useActions, useQuery, useWorld } from 'koota/react';
import { useCallback, useEffect, useRef } from 'react';
import { historyActions, selectionActions } from '../core/actions';
import { ShapeRenderer } from './shapes/shape-renderer';
import { sendEphemeralPresence, clearEphemeralPresence } from '../core/multiplayer/ephemeral';
import { IsLocal, IsSelected, StableId, User } from '../core/traits';

export function Canvas() {
    const world = useWorld();
    const { clearSelection, deleteSelected } = useActions(selectionActions);
    const { undo, redo } = useActions(historyActions);
    const selectedEntities = useQuery(IsSelected, StableId);
    const localUsers = useQuery(IsLocal, User);
    const cursorRef = useRef<{ x: number; y: number } | null>(null);
    const localName = localUsers[0]?.get(User)?.name;

    const selectionIds = selectedEntities
        .map((e) => e.get(StableId)?.id)
        .filter((id): id is number => id !== undefined)
        .sort((a, b) => a - b);
    const selectionKey = selectionIds.join(',');

    // Emit presence when selection changes
    useEffect(() => {
        sendEphemeralPresence(cursorRef.current, selectionIds, localName);
    }, [selectionKey, localName, selectionIds]);

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
            const cursor = { x: event.clientX, y: event.clientY };
            cursorRef.current = cursor;

            // Get current selection
            const selection: number[] = [];
            world.query(IsSelected, StableId).readEach(([stableId]) => {
                selection.push(stableId.id);
            });

            sendEphemeralPresence(cursor, selection, localName);
        },
        [world, localName]
    );

    const handlePointerLeave = useCallback(() => {
        cursorRef.current = null;
        // Send null cursor to indicate we left
        const selection: number[] = [];
        world.query(IsSelected, StableId).readEach(([stableId]) => {
            selection.push(stableId.id);
        });
        sendEphemeralPresence(null, selection, localName);
    }, [world, localName]);

    // Cleanup on unmount
    useEffect(() => {
        return () => clearEphemeralPresence();
    }, []);

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
