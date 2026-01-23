import { useActions } from 'koota/react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Entity } from 'koota';
import { historyActions } from '../../core/actions';
import { Rotation, Scale, StableId } from '../../core/traits';
import { Section } from '../ui/section';
import { RangeControl } from '../ui/range-control';

export function Transforms({ selected }: { selected: readonly Entity[] }) {
    const { recordRotationChange, recordScaleXChange, recordScaleYChange } = useActions(historyActions);

    const [rotation, setRotation] = useState(0);
    const [scaleX, setScaleX] = useState(1);
    const [scaleY, setScaleY] = useState(1);

    const initialRotation = useRef<number | null>(null);
    const initialScaleX = useRef<number | null>(null);
    const initialScaleY = useRef<number | null>(null);

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
        if (selected.length > 0) {
            const rot = selected[0].get(Rotation);
            if (rot) initialRotation.current = rot.angle;
        }
    }, [selected]);

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
        if (initialRotation.current !== null && initialRotation.current !== rotation) {
            recordRotationChange(selected, initialRotation.current, rotation);
        }
        initialRotation.current = null;
    }, [rotation, selected, recordRotationChange]);

    // Scale X handlers
    const handleScaleXStart = useCallback(() => {
        if (selected.length > 0) {
            const scale = selected[0].get(Scale);
            if (scale) initialScaleX.current = scale.x;
        }
    }, [selected]);

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
        if (initialScaleX.current !== null && initialScaleX.current !== scaleX) {
            recordScaleXChange(selected, initialScaleX.current, scaleX);
        }
        initialScaleX.current = null;
    }, [scaleX, selected, recordScaleXChange]);

    // Scale Y handlers
    const handleScaleYStart = useCallback(() => {
        if (selected.length > 0) {
            const scale = selected[0].get(Scale);
            if (scale) initialScaleY.current = scale.y;
        }
    }, [selected]);

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
        if (initialScaleY.current !== null && initialScaleY.current !== scaleY) {
            recordScaleYChange(selected, initialScaleY.current, scaleY);
        }
        initialScaleY.current = null;
    }, [scaleY, selected, recordScaleYChange]);

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
