import type { Trait } from '@koota/core';
import { formatSourceTitle } from '../../model/debug-source';
import { getTraitName, getTraitSource, getTraitType } from '../../model/trait-info';
import { useTraitEntityCount } from '../../state/use-world-data';
import { useWorld } from '../../state/use-world';
import { Row, RowCount, RowName } from '../../ui/row';
import { TraitTypeBadge } from './trait-type-badge';

interface TraitRowProps {
  trait: Trait;
  onSelect: (trait: Trait) => void;
}

export function TraitRow({ trait, onSelect }: TraitRowProps) {
  const world = useWorld();
  const entityCount = useTraitEntityCount(world, trait);
  const source = getTraitSource(trait);

  return (
    <Row onClick={() => onSelect(trait)} title={source && formatSourceTitle(source)}>
      <TraitTypeBadge type={getTraitType(trait)} />
      <RowName>{getTraitName(trait)}</RowName>
      <RowCount>{entityCount}</RowCount>
    </Row>
  );
}
