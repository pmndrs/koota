import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReactNode } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Empty } from './empty';
import { usePanel } from './panel/panel';

const ESTIMATED_ROW_HEIGHT = 23;

/** Offset of an element inside a scroll viewport, unaffected by transforms. */
function offsetWithin(element: HTMLElement, viewport: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = element;
  while (node && node !== viewport) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}

interface VirtualListProps<T> {
  items: T[];
  keyOf: (item: T) => string | number;
  renderRow: (item: T) => ReactNode;
  emptyMessage?: string;
}

/**
 * A virtualized list of rows. It scrolls with the panel viewport, so it can sit below other
 * content and still only render the visible rows, however many there are.
 */
export function VirtualList<T>({
  items,
  keyOf,
  renderRow,
  emptyMessage = 'Nothing here',
}: VirtualListProps<T>) {
  const { scrollRef } = usePanel();
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    if (listRef.current && scrollRef.current) {
      setScrollMargin(offsetWithin(listRef.current, scrollRef.current));
    }
  });

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
  });

  if (items.length === 0) return <Empty inline>{emptyMessage}</Empty>;

  return (
    <div ref={listRef} style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => {
        const value = items[item.index];
        return (
          <div
            key={keyOf(value)}
            ref={virtualizer.measureElement}
            data-index={item.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start - scrollMargin}px)`,
            }}
          >
            {renderRow(value)}
          </div>
        );
      })}
    </div>
  );
}
