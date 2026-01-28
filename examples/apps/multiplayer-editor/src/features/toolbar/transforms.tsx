import { useActions } from 'koota/react';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import type { Entity } from 'koota';
import { editingActions, userActions } from '../../core/actions';
import { Rotation, Scale } from '../../core/traits';
import { Section } from '../ui/section';
import { RangeControl } from '../ui/range-control';

export function Transforms({ selected }: { selected: readonly Entity[] }) {
    const { startEditing, commitEditing } = useActions(editingActions);
    const { getLocalUser } = useActions(userActions);

    const [rotation, setRotation] = useState(0);
    const [scaleX, setScaleX] = useState(1);
    const [scaleY, setScaleY] = useState(1);

    // Sync state with selected entity
    useEffect(() => {
        if (selected.length === 1) {
            const entity = selected[0];
            const rot = entity.get(Rotation);
            const scale = entity.get(Scale);
            if (rot) setRotation(rot.angle);
            if (scale) {
                setScaleX(scale.x);
                setScaleY(scale.y);
            }
        }
    }, [selected]);

    // Generic start/end handlers
    const handleEditStart = useCallback(
        (property: 'rotation' | 'scale') => {
            const localUser = getLocalUser();
            for (const entity of selected) {
                startEditing(entity, [property], localUser, 'discrete');
            }
        },
        [selected, startEditing, getLocalUser]
    );

    const handleEditEnd = useCallback(
        (property: 'rotation' | 'scale') => {
            for (const entity of selected) {
                commitEditing(entity, [property]);
            }
        },
        [selected, commitEditing]
    );

    // Change handlers
    const handleRotationChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const angle = Number(e.target.value);
            setRotation(angle);
            for (const entity of selected) {
                if (entity.has(Rotation)) entity.set(Rotation, { angle });
            }
        },
        [selected]
    );

    const handleScaleChange = useCallback(
        (axis: 'x' | 'y', value: number) => {
            axis === 'x' ? setScaleX(value) : setScaleY(value);

            for (const entity of selected) {
                const scale = entity.get(Scale);
                if (scale) {
                    entity.set(
                        Scale,
                        axis === 'x' ? { x: value, y: scale.y } : { x: scale.x, y: value }
                    );
                }
            }
        },
        [selected]
    );

    return (
        <>
            <Section>
                <RangeControl
                    label="Rotation"
                    valueLabel={`${rotation}°`}
                    min={0}
                    max={360}
                    value={rotation}
                    onPointerDown={() => handleEditStart('rotation')}
                    onChange={handleRotationChange}
                    onPointerUp={() => handleEditEnd('rotation')}
                />
            </Section>

            <Section>
                <RangeControl
                    label="Scale X"
                    valueLabel={scaleX.toFixed(2)}
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={scaleX}
                    onPointerDown={() => handleEditStart('scale')}
                    onChange={(e) => handleScaleChange('x', Number(e.target.value))}
                    onPointerUp={() => handleEditEnd('scale')}
                />
                <RangeControl
                    label="Scale Y"
                    valueLabel={scaleY.toFixed(2)}
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={scaleY}
                    onPointerDown={() => handleEditStart('scale')}
                    onChange={(e) => handleScaleChange('y', Number(e.target.value))}
                    onPointerUp={() => handleEditEnd('scale')}
                />
            </Section>
        </>
    );
}
