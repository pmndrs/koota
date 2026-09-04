import type { Entity, Relation, Trait } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import { getEntityInfo, matchesEntityFilter } from '../../model/entity-info';
import {
  compareTraitNames,
  getTraitId,
  getTraitName,
  getTraitRelation,
  getTraitType,
  matchesTraitFilter,
} from '../../model/trait-info';
import { useEntityHover } from '../../state/use-highlight';
import { useWorldEntities, useWorldTraits } from '../../state/use-world-data';
import { useWorld } from '../../state/use-world';
import { Badge } from '../../ui/badge';
import { Sheet } from '../../ui/sheet';
import { EntityGlyph } from './entity-glyph';

export type TraitPickerResult =
  { type: 'trait'; trait: Trait } | { type: 'relation'; relation: Relation<Trait>; target: Entity };

/**
 * Picking a plain trait finishes in one step. Picking a relation moves to a
 * second step that asks for its target, and Escape or back returns.
 */
type PickerStep = { step: 'trait' } | { step: 'target'; trait: Trait; relation: Relation<Trait> };

interface TraitPickerProps {
  entity: Entity;
  currentTraits: Trait[];
  onSelect: (result: TraitPickerResult) => void;
  onClose: () => void;
}

export function TraitPicker({ entity, currentTraits, onSelect, onClose }: TraitPickerProps) {
  const world = useWorld();
  const hover = useEntityHover();
  const allTraits = useWorldTraits(world);
  const allEntities = useWorldEntities(world);
  const [filter, setFilter] = useState('');
  const [step, setStep] = useState<PickerStep>({ step: 'trait' });

  const traits = useMemo(
    () => allTraits.filter((trait) => matchesTraitFilter(trait, filter)).sort(compareTraitNames),
    [allTraits, filter]
  );

  const entities = useMemo(
    () =>
      allEntities.filter((candidate) => matchesEntityFilter(getEntityInfo(world, candidate), filter)),
    [allEntities, filter, world]
  );

  const goToTraits = () => {
    setStep({ step: 'trait' });
    setFilter('');
  };

  const pickTrait = (trait: Trait) => {
    const relation = getTraitRelation(trait);
    if (relation) {
      setStep({ step: 'target', trait, relation });
      setFilter('');
      return;
    }
    onSelect({ type: 'trait', trait });
    onClose();
  };

  const pickTarget = (relation: Relation<Trait>, target: Entity) => {
    onSelect({ type: 'relation', relation, target });
    onClose();
  };

  useEffect(() => {
    if (step.step !== 'target') return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      goToTraits();
    };
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [step.step]);

  if (step.step === 'target') {
    const { relation, trait } = step;
    return (
      <Sheet onClose={onClose}>
        <Sheet.Header onBack={goToTraits}>
          Select target for <strong>{getTraitName(trait)}</strong>
        </Sheet.Header>
        <Sheet.Search value={filter} onChange={setFilter} placeholder="Search entities..." />
        <Sheet.List emptyMessage="No entities match filter">
          {entities.map((candidate) => {
            const info = getEntityInfo(world, candidate);
            return (
              <Sheet.Item
                key={candidate}
                icon={<EntityGlyph isWorld={info.isWorld} />}
                hint={candidate === entity ? 'self' : undefined}
                onClick={() => pickTarget(relation, candidate)}
                onMouseEnter={() => hover.hover(candidate)}
                onMouseLeave={() => hover.unhover(candidate)}
              >
                {info.label}
              </Sheet.Item>
            );
          })}
        </Sheet.List>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <Sheet.Search value={filter} onChange={setFilter} placeholder="Search traits..." />
      <Sheet.List emptyMessage="No traits match filter">
        {traits.map((trait) => {
          const type = getTraitType(trait);
          // Relations can be added again with another target, plain traits cannot
          const disabled = type !== 'rel' && currentTraits.includes(trait);
          return (
            <Sheet.Item
              key={getTraitId(trait)}
              icon={<Badge>{type}</Badge>}
              hint={type === 'rel' ? '→' : undefined}
              disabled={disabled}
              onClick={() => pickTrait(trait)}
            >
              {getTraitName(trait)}
            </Sheet.Item>
          );
        })}
      </Sheet.List>
    </Sheet>
  );
}
