import { useActions, useHas, useTrait } from 'koota/react';
import { type Entity } from 'koota';
import { useCallback, useRef } from 'react';
import { actions } from '../../core/actions';
import { historyActions } from '../../core/ops/history-actions';
import { OpCode, SEQ_UNASSIGNED } from '../../core/ops/types';
import { Dragging, IsSelected, Position, Ref, Shape, StableId } from '../../core/traits';

interface ShapeViewProps {
    entity: Entity;
}

export function ShapeView({ entity }: ShapeViewProps) {
    const shape = useTrait(entity, Shape);
    const position = useTrait(entity, Position);
    const isSelected = useHas(entity, IsSelected);
    const { selectShape } = useActions(actions);
    const { push, commit } = useActions(historyActions);

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
                const stableId = entity.get(StableId);

                if (
                    stableId &&
                    pos &&
                    (pos.x !== dragStartPos.current.x || pos.y !== dragStartPos.current.y)
                ) {
                    push({
                        op: OpCode.UpdatePosition,
                        id: stableId.id,
                        seq: SEQ_UNASSIGNED,
                        x: pos.x,
                        y: pos.y,
                        prevX: dragStartPos.current.x,
                        prevY: dragStartPos.current.y,
                    });
                    commit();
                }
                dragStartPos.current = null;
            }
        },
        [entity, push, commit]
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

    if (!shape || !position) return null;

    return (
        <div
            ref={handleInit}
            className={`shape ${shape.type} ${isSelected ? 'selected' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handleLostPointerCapture}
        />
    );
}
