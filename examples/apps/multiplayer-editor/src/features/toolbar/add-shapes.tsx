import { Section } from '../ui/section';

export function AddShapes({
    onAddRect,
    onAddEllipse,
}: {
    onAddRect: () => void;
    onAddEllipse: () => void;
}) {
    return (
        <Section>
            <button onClick={onAddRect}>Rectangle</button>
            <button onClick={onAddEllipse}>Ellipse</button>
        </Section>
    );
}
