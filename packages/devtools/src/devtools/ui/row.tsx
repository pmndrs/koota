import type { ReactNode } from 'react';
import styles from './row.module.css';

interface RowProps {
  children: ReactNode;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  title?: string;
  /** Rows that host their own controls skip the hover background. */
  flat?: boolean;
}

/**
 * One line in a list. Compose it from RowName, RowMeta, RowCount and
 * RowActions so every list shares the same rhythm.
 */
export function Row({ children, onClick, onMouseEnter, onMouseLeave, title, flat }: RowProps) {
  const className = [styles.row, onClick && styles.rowClickable, flat && styles.rowFlat]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={title}
    >
      {children}
    </div>
  );
}

export function RowName({ children }: { children: ReactNode }) {
  return <span className={styles.name}>{children}</span>;
}

export function RowMeta({ children }: { children: ReactNode }) {
  return <span className={styles.meta}>{children}</span>;
}

export function RowCount({ children }: { children: ReactNode }) {
  return <span className={styles.count}>{children}</span>;
}

/** Controls that appear when the row is hovered. */
export function RowActions({ children }: { children: ReactNode }) {
  return <span className={styles.actions}>{children}</span>;
}
