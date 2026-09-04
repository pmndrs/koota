import type { ReactNode, RefObject } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import theme from '../theme.module.css';
import styles from './panel.module.css';
import { useCustomScrollbar } from './use-custom-scrollbar';
import { useDraggable } from './use-draggable';

interface PanelContextValue {
  isOpen: boolean;
  toggleOpen: () => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  portalRoot: HTMLDivElement | null;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanel must be used within a <Panel>');
  return ctx;
}

/**
 * Cmd or Ctrl with plus, minus and zero scale the whole panel, which keeps it
 * readable on dense displays without touching the host page's zoom.
 */
function useZoomShortcuts() {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((prev) => Math.min(prev + 0.1, 2));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((prev) => Math.max(prev - 0.1, 0.5));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return zoom;
}

interface PanelProps {
  children: ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultOpen?: boolean;
}

/**
 * The floating window. It owns position, collapse state, zoom and the scroll
 * viewport, and exposes a portal root so overlays can cover the panel.
 */
function PanelBase({ children, defaultPosition = { x: 16, y: 16 }, defaultOpen = true }: PanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const zoom = useZoomShortcuts();
  const { position, isDragging, handleMouseDown } = useDraggable(defaultPosition);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const toggleOpen = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <PanelContext.Provider value={{ isOpen, toggleOpen, scrollRef, portalRoot }}>
      <div
        className={`${theme.theme} ${styles.root}`}
        style={{ top: position.y, left: position.x, transform: `scale(${zoom})` }}
        data-koota-devtools-root
      >
        <div ref={setPortalRoot} className={styles.panel}>
          <PanelDragContext.Provider value={{ isDragging, handleMouseDown }}>
            {children}
          </PanelDragContext.Provider>
        </div>
      </div>
    </PanelContext.Provider>
  );
}

const PanelDragContext = createContext<{
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
} | null>(null);

function PanelHeader({ children }: { children: ReactNode }) {
  const drag = useContext(PanelDragContext);
  if (!drag) throw new Error('Panel.Header must be used within a <Panel>');

  return (
    <div
      className={`${styles.header} ${drag.isDragging ? styles.headerDragging : ''}`}
      onMouseDown={drag.handleMouseDown}
    >
      {children}
    </div>
  );
}

interface PanelContentProps {
  children: ReactNode;
  /** Changing this value scrolls the viewport back to the top. */
  scrollKey?: string | number;
  /** Disables scrolling for views that manage their own viewport. */
  locked?: boolean;
}

function PanelContent(props: PanelContentProps) {
  const { isOpen } = usePanel();
  if (!isOpen) return null;
  return <ScrollArea {...props} />;
}

function ScrollArea({ children, scrollKey, locked = false }: PanelContentProps) {
  const { scrollRef } = usePanel();
  const scrollbar = useCustomScrollbar(scrollRef);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [scrollRef, scrollKey]);

  return (
    <div className={styles.scrollRoot} {...scrollbar.rootProps}>
      <div ref={scrollRef} className={`${styles.scroll} ${locked ? styles.scrollLocked : ''}`}>
        <div ref={scrollbar.contentRef}>{children}</div>
      </div>
      {scrollbar.isScrollable && (
        <div
          className={`${styles.scrollbar} ${scrollbar.isScrollbarVisible ? styles.scrollbarVisible : ''}`}
          aria-hidden="true"
        >
          <div
            className={styles.scrollThumb}
            style={scrollbar.thumbStyle}
            {...scrollbar.thumbProps}
          />
        </div>
      )}
    </div>
  );
}

function PanelPortal({ children }: { children: ReactNode }) {
  const { portalRoot } = usePanel();
  if (!portalRoot) return null;
  return createPortal(children, portalRoot);
}

export const Panel = Object.assign(PanelBase, {
  Header: PanelHeader,
  Content: PanelContent,
  Portal: PanelPortal,
});
