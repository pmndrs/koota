import { useActions, useWorld } from 'koota/react';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import type { Entity } from 'koota';
import { editingActions } from '../../core/actions';
import { Rotation, Scale, IsLocal } from '../../core/traits';
import { Section } from '../ui/section';
import { RangeControl } from '../ui/range-control';

export function Transforms({ selected }: { selected: readonly Entity[] }) {
    const world = useWorld();
    const { startEditing, commitEditing } = useActions(editingActions);

    const [rotation, setRotation] = useState(0);
    const [scaleX, setScaleX] = useState(1);
    const [scaleY, setScaleY] = useState(1);

    // Sync state with selected entity
    useEffect(() => {
        if (selected.length === 1) {
            const entity = selected[0];
            const entityRotation = entity.get(Rotation);
            const entityScale = entity.get(Scale);

            if (entityRotation) setRotation(entityRotation.angle);
            if (entityScale) {
                setScaleX(entityScale.x);
                setScaleY(entityScale.y);
            }
        }
    }, [selected]);

    // Rotation handlers
    const handleRotationStart = useCallback(() => {
        let localUser: Entity | undefined;
        world.query(IsLocal).readEach((_, entity) => {
            if (!localUser) localUser = entity;
        });
        if (selected.length > 0) {
            for (const entity of selected) {
                startEditing(entity, ['rotation'], localUser);
            }
        }
    }, [selected, startEditing, world]);

    const handleRotationChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const angle = Number(e.target.value);
            setRotation(angle);
            for (const entity of selected) {
                if (entity.has(Rotation)) {
                    entity.set(Rotation, { angle });
                }
            }
        },
        [selected]
    );

    const handleRotationEnd = useCallback(() => {
        for (const entity of selected) {
            commitEditing(entity, ['rotation']);
        }
    }, [selected, commitEditing]);

    // Scale X handlers
    const handleScaleXStart = useCallback(() => {
        let localUser: Entity | undefined;
        world.query(IsLocal).readEach((_, entity) => {
            if (!localUser) localUser = entity;
        });
        if (selected.length > 0) {
            for (const entity of selected) {
                startEditing(entity, ['scale'], localUser);
            }
        }
    }, [selected, startEditing, world]);

    const handleScaleXChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const x = Number(e.target.value);
            setScaleX(x);
            for (const entity of selected) {
                const scale = entity.get(Scale);
                if (scale) {
                    entity.set(Scale, { x, y: scale.y });
                }
            }
        },
        [selected]
    );

    const handleScaleXEnd = useCallback(() => {
        for (const entity of selected) {
            commitEditing(entity, ['scale']);
        }
    }, [selected, commitEditing]);

    // Scale Y handlers
    const handleScaleYStart = useCallback(() => {
        let localUser: Entity | undefined;
        world.query(IsLocal).readEach((_, entity) => {
            if (!localUser) localUser = entity;
        });
        if (selected.length > 0) {
            for (const entity of selected) {
                startEditing(entity, ['scale'], localUser);
            }
        }
    }, [selected, startEditing, world]);

    const handleScaleYChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const y = Number(e.target.value);
            setScaleY(y);
            for (const entity of selected) {
                const scale = entity.get(Scale);
                if (scale) {
                    entity.set(Scale, { x: scale.x, y });
                }
            }
        },
        [selected]
    );

    const handleScaleYEnd = useCallback(() => {
        for (const entity of selected) {
            commitEditing(entity, ['scale']);
        }
    }, [selected, commitEditing]);

    return (
        <>
            <Section>
                <RangeControl
                    label="Rotation"
                    valueLabel={`${rotation}°`}
                    min={0}
                    max={360}
                    value={rotation}
                    onPointerDown={handleRotationStart}
                    onChange={handleRotationChange}
                    onPointerUp={handleRotationEnd}
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
                    onPointerDown={handleScaleXStart}
                    onChange={handleScaleXChange}
                    onPointerUp={handleScaleXEnd}
                />
                <RangeControl
                    label="Scale Y"
                    valueLabel={scaleY.toFixed(2)}
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={scaleY}
                    onPointerDown={handleScaleYStart}
                    onChange={handleScaleYChange}
                    onPointerUp={handleScaleYEnd}
                />
            </Section>
        </>
    );
}
