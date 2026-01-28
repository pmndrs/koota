import { useActions, useHas, useQuery, useTrait } from 'koota/react';
import { Not } from 'koota';
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
    IsTombstoned,
} from '../../core/traits';
import { type Entity } from 'koota';
import { useCallback } from 'react';
import { selectionActions, editingActions, userActions } from '../../core/actions';
import { getClientColor } from '../../utils/get-client-color';

interface ShapeViewProps {
    entity: Entity;
}

export function ShapeRenderer() {
    const shapes = useQuery(Shape, Not(IsTombstoned));

    return shapes.map((entity) => <ShapeView key={entity.id()} entity={entity} />);
}

export function ShapeView({ entity }: ShapeViewProps) {
    const shape = useTrait(entity, Shape);
    const position = useTrait(entity, Position);
    const isSelected = useHas(entity, IsSelected);

    const { selectShape } = useActions(selectionActions);
    const { startEditing, commitEditing, cancelEditing } = useActions(editingActions);
    const { getLocalUser } = useActions(userActions);

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

            // Get local user entity (optional - only for EditedBy/broadcast)
            const localUser = getLocalUser();

            // Start editing - captures durable values (broadcast if local user exists)
            startEditing(entity, ['position'], localUser);

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
        [entity, selectShape, startEditing, getLocalUser]
    );

    const handlePointerUp = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const wasDragging = entity.has(Dragging);
            entity.remove(Dragging);
            event.currentTarget.releasePointerCapture(event.pointerId);

            // If we were dragging, commit the edit (creates op and broadcasts)
            if (wasDragging) commitEditing(entity, ['position']);
        },
        [entity, commitEditing]
    );

    const handlePointerCancel = useCallback(() => {
        const wasDragging = entity.has(Dragging);
        entity.remove(Dragging);
        if (wasDragging) cancelEditing(entity, ['position']);
    }, [entity, cancelEditing]);

    const handleLostPointerCapture = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.buttons === 0) {
                const wasDragging = entity.has(Dragging);
                entity.remove(Dragging);
                if (wasDragging) commitEditing(entity, ['position']);
            } else {
                cancelEditing(entity, ['position']);
            }
        },
        [entity, commitEditing, cancelEditing]
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
