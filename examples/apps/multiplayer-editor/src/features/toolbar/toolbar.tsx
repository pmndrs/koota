import { useActions, useQuery, useTrait, useWorld } from 'koota/react';
import type { Entity } from 'koota';
import { useCallback, useRef } from 'react';
import { actions } from '../../core/actions';
import { historyActions } from '../../core/ops/history-actions';
import { OpCode, SEQ_UNASSIGNED } from '../../core/ops/types';
import { Color, History, IsSelected, StableId } from '../../core/traits';
import { AddShapes } from './add-shapes';
import { ColorPicker } from './color-picker';
import { History as HistoryControls } from './history';
import { Transforms } from './transforms';
import { Section } from '../ui/section';

export function Toolbar() {
    const world = useWorld();
    const history = useTrait(world, History);
    const { addShape, deleteSelected, undo, redo } = useActions(actions);
    const { push, commit } = useActions(historyActions);
    const selected = useQuery(IsSelected);

    const canUndoValue = history ? history.undoStack.length > 0 : false;
    const canRedoValue = history ? history.redoStack.length > 0 : false;

    const initialColor = useRef<string | null>(null);

    const hasSelection = selected.length > 0;

    const selectedEntity = selected.length > 0 ? selected[0] : null;
    const entityColorTrait = selectedEntity?.get(Color);
    const displayColor = entityColorTrait?.fill ?? '#4a90d9';

    const handleAddRect = useCallback(() => {
        addShape('rect', window.innerWidth / 2, window.innerHeight / 2);
    }, [addShape]);

    const handleAddEllipse = useCallback(() => {
        addShape('ellipse', window.innerWidth / 2, window.innerHeight / 2);
    }, [addShape]);

    const handlePreviewColor = useCallback(
        (hex: string) => {
            if (initialColor.current === null) {
                initialColor.current = displayColor;
            }
            for (const entity of selected) {
                if (entity.has(Color)) {
                    entity.set(Color, { fill: hex });
                }
            }
        },
        [selected, displayColor]
    );

    const handleCommitColor = useCallback(
        (hex: string) => {
            if (initialColor.current !== null && hex !== initialColor.current) {
                for (const entity of selected) {
                    const stableId = entity.get(StableId);
                    if (stableId) {
                        push({
                            op: OpCode.UpdateColor,
                            id: stableId.id,
                            seq: SEQ_UNASSIGNED,
                            fill: hex,
                            prevFill: initialColor.current,
                        });
                    }
                }
                commit();
            }
            initialColor.current = null;
        },
        [selected, push, commit]
    );

    const handleCancelColor = useCallback(() => {
        if (initialColor.current !== null) {
            for (const entity of selected) {
                if (entity.has(Color)) {
                    entity.set(Color, { fill: initialColor.current });
                }
            }
        }
        initialColor.current = null;
    }, [selected]);

    return (
        <div className="toolbar">
            <AddShapes onAddRect={handleAddRect} onAddEllipse={handleAddEllipse} />

            {hasSelection && (
                <>
                    <ColorPicker
                        displayColor={displayColor}
                        onPreview={handlePreviewColor}
                        onCommit={handleCommitColor}
                        onCancel={handleCancelColor}
                    />

                    <Transforms selected={selected as readonly Entity[]} />

                    <Section>
                        <button onClick={deleteSelected} className="delete-btn">
                            Delete
                        </button>
                    </Section>
                </>
            )}

            <HistoryControls
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndoValue}
                canRedo={canRedoValue}
            />
        </div>
    );
}
