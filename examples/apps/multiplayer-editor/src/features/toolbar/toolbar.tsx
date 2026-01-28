import { useQuery } from 'koota/react';
import { IsSelected } from '../../core/traits';
import { AddShapes } from './add-shapes';
import { ColorControl } from './color-control';
import { DeleteButton } from './delete-button';
import { History } from './history';
import { Transforms } from './transforms';

export function Toolbar() {
    const selected = useQuery(IsSelected);

    return (
        <div className="toolbar">
            <AddShapes />

            {selected.length > 0 && (
                <>
                    <ColorControl selected={selected} />
                    <Transforms selected={selected} />
                    <DeleteButton />
                </>
            )}

            <History />
        </div>
    );
}
