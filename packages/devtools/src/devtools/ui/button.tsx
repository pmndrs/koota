import type { MouseEvent, ReactNode } from 'react';
import styles from './button.module.css';

interface ButtonProps {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  active?: boolean;
}

/** A quiet text button. Tabs, toggles and small actions all use it. */
export function Button({ children, onClick, title, active = false }: ButtonProps) {
  return (
    <button
      className={`${styles.button} ${active ? styles.active : ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonProps {
  size?: 'sm' | 'md';
  danger?: boolean;
  /** A small counter drawn over the corner, for active filter counts. */
  count?: number;
}

/** A square button for a single glyph or icon. */
export function IconButton({
  children,
  onClick,
  title,
  active = false,
  size = 'md',
  danger = false,
  count,
}: IconButtonProps) {
  const className = [
    styles.button,
    styles.icon,
    size === 'sm' && styles.iconSm,
    active && styles.active,
    danger && styles.danger,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={className} onClick={onClick} title={title}>
      {children}
      {count !== undefined && count > 0 && <span className={styles.count}>{count}</span>}
    </button>
  );
}
