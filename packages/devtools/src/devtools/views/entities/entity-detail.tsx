import type { Entity, Trait } from '@koota/core';
import { useMemo, useState } from 'react';
import { getEntityInfo } from '../../model/entity-info';
import { compareTraitNames, getTraitId } from '../../model/trait-info';
import { useEntityTraits } from '../../state/use-world-data';
import { useWorld } from '../../state/use-world';
import { Button } from '../../ui/button';
import { Empty } from '../../ui/empty';
import { Page, PropertyList, Section } from '../../ui/page';
import { EntityGlyph } from './entity-glyph';
import { EntityTraitRow } from './entity-trait-row';
import { TraitPicker, type TraitPickerResult } from './trait-picker';

interface EntityDetailProps {
  entity: Entity;
  onSelectTrait: (trait: Trait) => void;
  onSelectEntity: (entity: Entity) => void;
}

export function EntityDetail({ entity, onSelectTrait, onSelectEntity }: EntityDetailProps) {
  const world = useWorld();
  const info = getEntityInfo(world, entity);
  const traits = useEntityTraits(world, entity);
  const sortedTraits = useMemo(() => [...traits].sort(compareTraitNames), [traits]);
  const [expandedTraitId, setExpandedTraitId] = useState<number | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const addTrait = (result: TraitPickerResult) => {
    if (result.type === 'trait') entity.add(result.trait);
    else entity.add(result.relation(result.target));
  };

  return (
    <Page
      title={
        <>
          <EntityGlyph isWorld={info.isWorld} size={14} />
          {info.label}
        </>
      }
      actions={
        <Button onClick={() => setIsPickerOpen((prev) => !prev)} title="Add trait to entity">
          + Add
        </Button>
      }
    >
      <Section label="Metadata" summary={`id:${info.id} gen:${info.generation}`}>
        <PropertyList
          items={[
            { label: 'ID', value: info.id },
            { label: 'Generation', value: info.generation },
            { label: 'World', value: info.worldId },
            { label: 'Raw', value: String(entity) },
          ]}
        />
      </Section>

      <Section label="Traits" count={sortedTraits.length}>
        {sortedTraits.length === 0 ? (
          <Empty inline>No traits on entity</Empty>
        ) : (
          sortedTraits.map((trait) => {
            const id = getTraitId(trait);
            return (
              <EntityTraitRow
                key={id}
                entity={entity}
                trait={trait}
                expanded={expandedTraitId === id}
                onToggle={() => setExpandedTraitId(expandedTraitId === id ? null : id)}
                onRemove={() => entity.remove(trait)}
                onInspect={() => onSelectTrait(trait)}
                onSelectEntity={onSelectEntity}
              />
            );
          })
        )}
      </Section>

      {isPickerOpen && (
        <TraitPicker
          entity={entity}
          currentTraits={traits}
          onSelect={addTrait}
          onClose={() => setIsPickerOpen(false)}
        />
      )}
    </Page>
  );
}
