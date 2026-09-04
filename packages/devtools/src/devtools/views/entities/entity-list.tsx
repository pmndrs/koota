import type { Entity } from '@koota/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState } from 'react';
import { useWorldEntities } from '../../state/use-world-data';
import { useWorld } from '../../state/use-world';
import { Empty } from '../../ui/empty';
import { usePanel } from '../../ui/panel/panel';
import { EntityRow } from './entity-row';

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

interface EntityListProps {
  entities: Entity[];
  onSelect?: (entity: Entity) => void;
  emptyMessage?: string;
}

/**
 * A virtualized list of entity rows. It scrolls with the panel viewport, so
 * it can sit below other content and still only render the visible rows.
 */
export function EntityList({ entities, onSelect, emptyMessage = 'No entities' }: EntityListProps) {
  const { scrollRef } = usePanel();
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    if (listRef.current && scrollRef.current) {
      setScrollMargin(offsetWithin(listRef.current, scrollRef.current));
    }
  });

  const virtualizer = useVirtualizer({
    count: entities.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 10,
    scrollMargin,
  });

  if (entities.length === 0) return <Empty inline>{emptyMessage}</Empty>;

  return (
    <div ref={listRef} style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => {
        const entity = entities[item.index];
        return (
          <div
            key={entity}
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
            <EntityRow entity={entity} onSelect={onSelect} />
          </div>
        );
      })}
    </div>
  );
}

/** Every entity in the world, kept in sync with spawns and destroys. */
export function WorldEntityList({ onSelect }: { onSelect: (entity: Entity) => void }) {
  const world = useWorld();
  const entities = useWorldEntities(world);
  return <EntityList entities={entities} onSelect={onSelect} />;
}
