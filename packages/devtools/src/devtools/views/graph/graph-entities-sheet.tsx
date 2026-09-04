import type { Entity } from '@koota/core';
import { useMemo, useState } from 'react';
import { getEntityInfo, matchesEntityFilter } from '../../model/entity-info';
import { useEntityHover } from '../../state/use-highlight';
import { useWorld } from '../../state/use-world';
import { Sheet } from '../../ui/sheet';
import { EntityGlyph } from '../entities/entity-glyph';

interface GraphEntitiesSheetProps {
  title: string;
  /** Live list; the parent re-renders with a fresh array when the world changes. */
  entities: Entity[];
  onSelect: (entity: Entity) => void;
  onClose: () => void;
}

/** Lists the entities behind a group or aggregate node so one can be focused. */
export function GraphEntitiesSheet({ title, entities, onSelect, onClose }: GraphEntitiesSheetProps) {
  const world = useWorld();
  const hover = useEntityHover();
  const [filter, setFilter] = useState('');

  const visible = useMemo(
    () =>
      entities.filter(
        (entity) => world.has(entity) && matchesEntityFilter(getEntityInfo(world, entity), filter)
      ),
    [entities, filter, world]
  );

  return (
    <Sheet onClose={onClose}>
      <Sheet.Header>{title}</Sheet.Header>
      <Sheet.Search
        value={filter}
        onChange={setFilter}
        placeholder={`Search ${visible.length} entities...`}
      />
      <Sheet.List emptyMessage="No entities found">
        {visible.map((entity) => {
          const info = getEntityInfo(world, entity);
          return (
            <Sheet.Item
              key={entity}
              icon={<EntityGlyph isWorld={info.isWorld} />}
              onClick={() => {
                hover.unhover(entity);
                onSelect(entity);
              }}
              onMouseEnter={() => hover.hover(entity)}
              onMouseLeave={() => hover.unhover(entity)}
            >
              {info.label}
            </Sheet.Item>
          );
        })}
      </Sheet.List>
    </Sheet>
  );
}
