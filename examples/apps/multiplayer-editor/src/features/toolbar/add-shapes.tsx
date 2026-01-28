import { useActions } from 'koota/react';
import { shapeActions } from '../../core/actions';
import { Section } from '../ui/section';

export function AddShapes() {
    const { addShape } = useActions(shapeActions);

    return (
        <Section>
            <button onClick={() => addShape('rect', window.innerWidth / 2, window.innerHeight / 2)}>
                Rectangle
            </button>
            <button onClick={() => addShape('ellipse', window.innerWidth / 2, window.innerHeight / 2)}>
                Ellipse
            </button>
        </Section>
    );
}
