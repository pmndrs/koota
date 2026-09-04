import type { Entity, Relation, Trait } from '@koota/core';
import { useMemo, useState } from 'react';
import { getEntityInfo, matchesEntityFilter } from '../../model/entity-info';
import { useEntityHover } from '../../state/use-highlight';
import { useRelationSources } from '../../state/use-world-data';
import { useWorld } from '../../state/use-world';
import { Sheet } from '../../ui/sheet';
import { EntityGlyph } from '../entities/entity-glyph';

interface RelationSourcesSheetProps {
  title: string;
  relation: Relation<Trait>;
  target: Entity;
  onSelect: (entity: Entity) => void;
  onClose: () => void;
}

/** Lists the entities behind an aggregate node so one can be opened. */
export function RelationSourcesSheet({
  title,
  relation,
  target,
  onSelect,
  onClose,
}: RelationSourcesSheetProps) {
  const world = useWorld();
  const hover = useEntityHover();
  const sources = useRelationSources(world, relation, target);
  const [filter, setFilter] = useState('');

  const entities = useMemo(
    () =>
      sources.filter(
        (entity) => world.has(entity) && matchesEntityFilter(getEntityInfo(world, entity), filter)
      ),
    [sources, filter, world]
  );

  return (
    <Sheet onClose={onClose}>
      <Sheet.Header>{title}</Sheet.Header>
      <Sheet.Search
        value={filter}
        onChange={setFilter}
        placeholder={`Search ${entities.length} entities...`}
      />
      <Sheet.List emptyMessage="No entities found">
        {entities.map((entity) => {
          const info = getEntityInfo(world, entity);
          return (
            <Sheet.Item
              key={entity}
              icon={<EntityGlyph isWorld={info.isWorld} />}
              onClick={() => onSelect(entity)}
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
