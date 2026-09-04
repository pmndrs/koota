import { Button } from './button';
import styles from './segmented.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** A row of exclusive choices, for switching between ways of showing the same thing. */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="tablist">
      {options.map((option) => (
        <Button
          key={option.value}
          active={option.value === value}
          onClick={() => onChange(option.value)}
          title={option.title}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
