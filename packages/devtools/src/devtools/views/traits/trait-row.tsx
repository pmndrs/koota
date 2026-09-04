import type { Trait } from '@koota/core';
import { formatSourceTitle } from '../../model/debug-source';
import { getTraitName, getTraitSource, getTraitType } from '../../model/trait-info';
import { useTraitEntityCount } from '../../state/use-world-data';
import { useWorld } from '../../state/use-world';
import { Badge } from '../../ui/badge';
import { Row, RowCount, RowName } from '../../ui/row';

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
      <Badge>{getTraitType(trait)}</Badge>
      <RowName>{getTraitName(trait)}</RowName>
      <RowCount>{entityCount}</RowCount>
    </Row>
  );
}
