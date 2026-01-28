import { useActions, useTrait, useWorld } from 'koota/react';
import { historyActions } from '../../core/actions';
import { History as HistoryTrait } from '../../core/traits';
import { Section } from '../ui/section';

export function History() {
    const world = useWorld();
    const history = useTrait(world, HistoryTrait);
    const { undo, redo, canUndo, canRedo } = useActions(historyActions);

    const canUndoValue = history ? canUndo() : false;
    const canRedoValue = history ? canRedo() : false;

    return (
        <Section>
            <button onClick={undo} disabled={!canUndoValue}>
                Undo
            </button>
            <button onClick={redo} disabled={!canRedoValue}>
                Redo
            </button>
        </Section>
    );
}
