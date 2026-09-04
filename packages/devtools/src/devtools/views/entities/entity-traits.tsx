import type { Entity, Trait } from '@koota/core';
import { useMemo, useState } from 'react';
import { compareTraitNames, getTraitId } from '../../model/trait-info';
import { useEntityTraits } from '../../state/use-world-data';
import { useWorld } from '../../state/use-world';
import { Empty } from '../../ui/empty';
import { Section } from '../../ui/page';
import { EntityTraitRow } from './entity-trait-row';
import { TraitPicker, type TraitPickerResult } from './trait-picker';

interface EntityTraitsProps {
  entity: Entity;
  onSelectTrait: (trait: Trait) => void;
  onSelectEntity: (entity: Entity) => void;
  /** Whether the add-trait picker is showing; the parent owns the button that opens it. */
  pickerOpen: boolean;
  onClosePicker: () => void;
}

/** The traits on one entity with their values, plus the picker for adding more. */
export function EntityTraits({
  entity,
  onSelectTrait,
  onSelectEntity,
  pickerOpen,
  onClosePicker,
}: EntityTraitsProps) {
  const world = useWorld();
  const traits = useEntityTraits(world, entity);
  const sortedTraits = useMemo(() => [...traits].sort(compareTraitNames), [traits]);
  const [expandedTraitId, setExpandedTraitId] = useState<number | null>(null);

  const addTrait = (result: TraitPickerResult) => {
    if (result.type === 'trait') entity.add(result.trait);
    else entity.add(result.relation(result.target));
  };

  return (
    <>
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

      {pickerOpen && (
        <TraitPicker
          entity={entity}
          currentTraits={traits}
          onSelect={addTrait}
          onClose={onClosePicker}
        />
      )}
    </>
  );
}
