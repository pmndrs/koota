import type { ReactNode } from 'react';
import styles from './toolbar.module.css';

interface ToolbarProps {
  /** Usually a Segmented switcher; sits at the start of the row. */
  children: ReactNode;
  /** Controls for whatever is selected; sit at the end of the row. */
  actions?: ReactNode;
  /** A second row under the main one, e.g. an expanded filter. */
  drawer?: ReactNode;
}

/**
 * The row above a view: what is shown on the left, controls for it on the right. Views
 * swap the actions as their mode changes so the row keeps one shape.
 */
export function Toolbar({ children, actions, drawer }: ToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.row}>
        <div className={styles.start}>{children}</div>
        {actions && <div className={styles.end}>{actions}</div>}
      </div>
      {drawer && <div className={styles.drawer}>{drawer}</div>}
    </div>
  );
}
