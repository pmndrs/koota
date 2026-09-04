import styles from './text-input.module.css';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TextInput({ value, onChange, placeholder }: TextInputProps) {
  return (
    <input
      type="text"
      className={styles.input}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
