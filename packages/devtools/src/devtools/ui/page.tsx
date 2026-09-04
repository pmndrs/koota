import type { ReactNode } from 'react';
import { useState } from 'react';
import { Chevron } from './icons';
import styles from './page.module.css';

interface PageProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Controls or a badge shown on the right of the title. */
  actions?: ReactNode;
  children: ReactNode;
}

/** A detail view with a heading followed by sections. */
export function Page({ title, subtitle, actions, children }: PageProps) {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.title}>{title}</span>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

interface SectionProps {
  label: string;
  count?: number;
  children: ReactNode;
  /** When set the section starts collapsed and shows this next to the label. */
  summary?: ReactNode;
}

export function Section({ label, count, children, summary }: SectionProps) {
  const collapsible = summary !== undefined;
  const [open, setOpen] = useState(!collapsible);

  return (
    <div className={styles.section}>
      <div
        className={`${styles.sectionHeader} ${collapsible ? styles.sectionToggle : ''}`}
        onClick={collapsible ? () => setOpen((prev) => !prev) : undefined}
      >
        <span>{label}</span>
        {count !== undefined && <span className={styles.sectionCount}>{count}</span>}
        {collapsible && <Chevron open={open} />}
        {collapsible && !open && <span className={styles.sectionSummary}>{summary}</span>}
      </div>
      {open && children}
    </div>
  );
}

interface PropertyListProps {
  items: { label: string; value: ReactNode }[];
}

/** Label and value pairs, for metadata and schemas. */
export function PropertyList({ items }: PropertyListProps) {
  return (
    <div className={styles.properties}>
      {items.map(({ label, value }) => (
        <div key={label} className={styles.property}>
          <span className={styles.propertyLabel}>{label}</span>
          <span className={styles.propertyValue}>{value}</span>
        </div>
      ))}
    </div>
  );
}
