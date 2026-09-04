import type { ReactNode } from 'react';
import styles from './empty.module.css';

interface EmptyProps {
  children: ReactNode;
  /** A second, quieter line. */
  hint?: ReactNode;
  /** Sits inside a section instead of filling the view. */
  inline?: boolean;
}

export function Empty({ children, hint, inline = false }: EmptyProps) {
  return (
    <div className={`${styles.empty} ${inline ? styles.inline : ''} ${hint ? styles.stack : ''}`}>
      <div>{children}</div>
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}
