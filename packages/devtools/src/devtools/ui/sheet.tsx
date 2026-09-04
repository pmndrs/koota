import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { Empty } from './empty';
import { Panel } from './panel/panel';
import styles from './sheet.module.css';

const EXIT_DURATION = 400;

interface SheetProps {
  onClose: () => void;
  children: ReactNode;
}

/**
 * A bottom sheet that slides over the panel for picking from a list. It plays
 * its exit animation before reporting the close so the parent can unmount it.
 */
function SheetBase({ onClose, children }: SheetProps) {
  const [isClosing, setIsClosing] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(onClose, EXIT_DURATION);
  }, [isClosing, onClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [close]);

  return (
    <Panel.Portal>
      <div
        ref={backdropRef}
        className={`${styles.backdrop} ${isClosing ? styles.backdropExit : ''}`}
        onClick={(e) => e.target === backdropRef.current && close()}
      >
        <div className={`${styles.sheet} ${isClosing ? styles.sheetExit : ''}`}>{children}</div>
      </div>
    </Panel.Portal>
  );
}

function SheetHeader({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  return (
    <div className={styles.header}>
      {onBack && (
        <Button onClick={onBack} title="Back">
          ←
        </Button>
      )}
      <span className={styles.headerTitle}>{children}</span>
    </div>
  );
}

interface SheetSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function SheetSearch({ value, onChange, placeholder = 'Search...' }: SheetSearchProps) {
  return (
    <input
      type="text"
      className={styles.input}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SheetList({ children, emptyMessage }: { children: ReactNode[]; emptyMessage: string }) {
  return (
    <div className={styles.list}>
      {children.length === 0 ? <Empty>{emptyMessage}</Empty> : children}
    </div>
  );
}

interface SheetItemProps {
  children: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function SheetItem({
  children,
  icon,
  hint,
  disabled = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: SheetItemProps) {
  return (
    <button
      className={`${styles.item} ${disabled ? styles.itemDisabled : ''}`}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      disabled={disabled}
    >
      {icon}
      <span className={styles.itemLabel}>{children}</span>
      {hint && <span className={styles.itemHint}>{hint}</span>}
    </button>
  );
}

export const Sheet = Object.assign(SheetBase, {
  Header: SheetHeader,
  Search: SheetSearch,
  List: SheetList,
  Item: SheetItem,
});
