import { Section } from '../ui/section';

export function History({
    onUndo,
    onRedo,
    canUndo,
    canRedo,
}: {
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}) {
    return (
        <Section>
            <button onClick={onUndo} disabled={!canUndo}>
                Undo
            </button>
            <button onClick={onRedo} disabled={!canRedo}>
                Redo
            </button>
        </Section>
    );
}
