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
    const [scale, setScale] = useState(1);

    // Sync state with selected entity
    useEffect(() => {
        if (selected.length === 1) {
            const entity = selected[0];
            const rot = entity.get(Rotation);
            const scaleData = entity.get(Scale);
            if (rot) setRotation(rot.angle);
            if (scaleData) setScale(scaleData.x);
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
        (e: ChangeEvent<HTMLInputElement>) => {
            const value = Number(e.target.value);
            setScale(value);

            for (const entity of selected) {
                if (entity.has(Scale)) {
                    entity.set(Scale, { x: value, y: value });
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
                    label="Scale"
                    valueLabel={scale.toFixed(2)}
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={scale}
                    onPointerDown={() => handleEditStart('scale')}
                    onChange={handleScaleChange}
                    onPointerUp={() => handleEditEnd('scale')}
                />
            </Section>
        </>
    );
}
