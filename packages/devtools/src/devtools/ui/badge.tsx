import type { ReactNode } from 'react';
import styles from './badge.module.css';

export type BadgeTone = 'blue' | 'teal' | 'peach' | 'lavender';

interface BadgeProps {
  children: ReactNode;
  size?: 'sm' | 'md';
  /** Fills the badge with one of the theme tones. Without it the badge is plain text. */
  tone?: BadgeTone;
}

/** A small uppercase label, used for trait types. */
export function Badge({ children, size = 'sm', tone }: BadgeProps) {
  const className = [styles.badge, size === 'md' && styles.badgeMd, tone && styles[tone]]
    .filter(Boolean)
    .join(' ');

  return <span className={className}>{children}</span>;
}
