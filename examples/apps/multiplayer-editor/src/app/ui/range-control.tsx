import type { ChangeEvent } from 'react';

type RangeControlProps = {
    label: string;
    valueLabel: string;
    min: number;
    max: number;
    step?: number;
    value: number;
    onPointerDown: () => void;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onPointerUp: () => void;
};

export function RangeControl({
    label,
    valueLabel,
    min,
    max,
    step,
    value,
    onPointerDown,
    onChange,
    onPointerUp,
}: RangeControlProps) {
    return (
        <label>
            {label} {valueLabel}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onPointerDown={onPointerDown}
                onChange={onChange}
                onPointerUp={onPointerUp}
            />
        </label>
    );
}
