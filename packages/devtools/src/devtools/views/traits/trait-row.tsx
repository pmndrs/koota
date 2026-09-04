import type { Trait } from '@koota/core';
import { formatSourceTitle } from '../../model/debug-source';
import { getTraitName, getTraitSource, getTraitType } from '../../model/trait-info';
import { Row, RowCount, RowName } from '../../ui/row';
import { TraitTypeBadge } from './trait-type-badge';

interface TraitRowProps {
  trait: Trait;
  /** Entities carrying the trait; the list counts every trait in one pass. */
  count: number;
  onSelect: (trait: Trait) => void;
}

export function TraitRow({ trait, count, onSelect }: TraitRowProps) {
  const source = getTraitSource(trait);

  return (
    <Row onClick={() => onSelect(trait)} title={source && formatSourceTitle(source)}>
      <TraitTypeBadge type={getTraitType(trait)} />
      <RowName>{getTraitName(trait)}</RowName>
      <RowCount>{count}</RowCount>
    </Row>
  );
}
