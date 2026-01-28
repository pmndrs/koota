import { useActions, useQuery, useTrait, useWorld } from 'koota/react';
import type { Entity } from 'koota';
import { useCallback } from 'react';
import { editingActions, historyActions, selectionActions, shapeActions } from '../../core/actions';
import { Color, History, IsLocal, IsSelected } from '../../core/traits';
import { AddShapes } from './add-shapes';
import { ColorPicker } from './color-picker';
import { History as HistoryControls } from './history';
import { Transforms } from './transforms';
import { Section } from '../ui/section';

export function Toolbar() {
    const world = useWorld();
    const history = useTrait(world, History);
    const { addShape } = useActions(shapeActions);
    const { deleteSelected } = useActions(selectionActions);
    const { undo, redo } = useActions(historyActions);
    const { startEditing, commitEditing, cancelEditing } = useActions(editingActions);
    const selected = useQuery(IsSelected);

    const canUndoValue = history ? history.undoStack.length > 0 : false;
    const canRedoValue = history ? history.redoStack.length > 0 : false;

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

    const handleStartColorEdit = useCallback(() => {
        let localUser: Entity | undefined;
        world.query(IsLocal).readEach((_, entity) => {
            if (!localUser) localUser = entity;
        });
        for (const entity of selected) {
            startEditing(entity, ['color'], localUser);
        }
    }, [selected, startEditing, world]);

    const handlePreviewColor = useCallback(
        (hex: string) => {
            for (const entity of selected) {
                if (entity.has(Color)) {
                    entity.set(Color, { fill: hex });
                }
            }
        },
        [selected]
    );

    const handleCommitColor = useCallback(() => {
        for (const entity of selected) {
            commitEditing(entity, ['color']);
        }
    }, [selected, commitEditing]);

    const handleCancelColor = useCallback(() => {
        for (const entity of selected) {
            cancelEditing(entity, ['color']);
        }
    }, [selected, cancelEditing]);

    return (
        <div className="toolbar">
            <AddShapes onAddRect={handleAddRect} onAddEllipse={handleAddEllipse} />

            {hasSelection && (
                <>
                    <ColorPicker
                        displayColor={displayColor}
                        onOpen={handleStartColorEdit}
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
