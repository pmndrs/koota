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
    const percent = ((value - min) / (max - min)) * 100;

    return (
        <label className="range-control" style={{ '--fill': `${percent}%` } as React.CSSProperties}>
            <span className="range-label">{label}</span>
            <span className="range-value">{valueLabel}</span>
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
