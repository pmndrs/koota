import type { ReactNode } from 'react';
import styles from './badge.module.css';

interface BadgeProps {
  children: ReactNode;
  size?: 'sm' | 'md';
}

/** A small uppercase label, used for trait types. */
export function Badge({ children, size = 'sm' }: BadgeProps) {
  return <span className={`${styles.badge} ${size === 'md' ? styles.badgeMd : ''}`}>{children}</span>;
}
