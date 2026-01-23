import { useActions, useHas, useQuery, useTrait } from 'koota/react';
import {
    Dragging,
    IsSelected,
    Position,
    Ref,
    Shape,
    StableId,
    IsRemote,
    RemoteSelection,
    ClientId,
} from '../../core/traits';
import { type Entity } from 'koota';
import { useRef, useCallback } from 'react';
import { selectionActions } from '../../core/actions';
import { historyActions } from '../../core/actions';

// Generate a consistent color from client ID (matches cursor color)
function getClientColor(clientId: string): string {
    let hash = 0;
    for (let i = 0; i < clientId.length; i++) {
        hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 50%)`;
}

interface ShapeViewProps {
    entity: Entity;
}

export function ShapeRenderer() {
    const shapes = useQuery(Shape);

    return shapes.map((entity) => <ShapeView key={entity.id()} entity={entity} />);
}

export function ShapeView({ entity }: ShapeViewProps) {
    const shape = useTrait(entity, Shape);
    const position = useTrait(entity, Position);
    const isSelected = useHas(entity, IsSelected);
    const { selectShape } = useActions(selectionActions);
    const { recordPositionChange } = useActions(historyActions);

    // Track position at drag start for undo
    const dragStartPos = useRef<{ x: number; y: number } | null>(null);

    const handleInit = useCallback(
        (div: HTMLDivElement | null) => {
            if (!div || !entity.isAlive()) return;
            entity.add(Ref(div));
            return () => entity.remove(Ref);
        },
        [entity]
    );

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            event.stopPropagation(); // Prevent canvas from clearing selection

            const pos = entity.get(Position);
            if (!pos) return;

            // Store position at drag start for undo
            dragStartPos.current = { x: pos.x, y: pos.y };

            const offset = {
                offsetX: event.clientX - pos.x,
                offsetY: event.clientY - pos.y,
            };

            // Select the shape (additive if Shift is held)
            selectShape(entity, event.shiftKey);

            // Start dragging
            entity.add(Dragging(offset));

            event.currentTarget.setPointerCapture(event.pointerId);
        },
        [entity, selectShape]
    );

    const handlePointerUp = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const wasDragging = entity.has(Dragging);
            entity.remove(Dragging);
            event.currentTarget.releasePointerCapture(event.pointerId);

            // If we were dragging, record the position change for undo
            if (wasDragging && dragStartPos.current) {
                const pos = entity.get(Position);
                if (pos) {
                    recordPositionChange(entity, dragStartPos.current, { x: pos.x, y: pos.y });
                }
                dragStartPos.current = null;
            }
        },
        [entity, recordPositionChange]
    );

    const handlePointerCancel = useCallback(() => {
        entity.remove(Dragging);
        dragStartPos.current = null;
    }, [entity]);

    const handleLostPointerCapture = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.buttons === 0) {
                entity.remove(Dragging);
                dragStartPos.current = null;
            }
        },
        [entity]
    );

    const stableId = useTrait(entity, StableId);

    if (!shape || !position) return null;

    return (
        <div
            ref={handleInit}
            className={`shape ${shape.type} ${isSelected ? 'selected' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handleLostPointerCapture}
        >
            {stableId && <RemoteSelectionRenderer stableId={stableId.id} />}
        </div>
    );
}

// Shows colored borders for remote users who have this shape selected
function RemoteSelectionRenderer({ stableId }: { stableId: number }) {
    const remoteUsers = useQuery(IsRemote, RemoteSelection, ClientId);

    return (
        <>
            {remoteUsers.map((userEntity) => (
                <RemoteSelectionBorder
                    key={userEntity.id()}
                    userEntity={userEntity}
                    stableId={stableId}
                />
            ))}
        </>
    );
}

function RemoteSelectionBorder({ userEntity, stableId }: { userEntity: Entity; stableId: number }) {
    const clientIdTrait = useTrait(userEntity, ClientId);
    const selection = useTrait(userEntity, RemoteSelection);

    if (!clientIdTrait || !selection?.includes(stableId)) return null;

    const color = getClientColor(clientIdTrait.id);

    return (
        <div
            style={{
                position: 'absolute',
                inset: -4,
                border: `3px solid ${color}`,
                borderRadius: '6px',
                pointerEvents: 'none',
            }}
        />
    );
}
