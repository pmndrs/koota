import { useQuery } from 'koota/react';
import { Shape } from '../../core/traits';
import { ShapeView } from './shape-view';

export function ShapeRenderer() {
    const shapes = useQuery(Shape);

    return shapes.map((entity) => <ShapeView key={entity.id()} entity={entity} />);
}
