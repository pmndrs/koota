import type { Trait } from '@koota/core';
import { useMemo, useState } from 'react';
import {
  compareTraitNames,
  getTraitId,
  getTraitType,
  matchesTraitFilter,
  type TraitType,
} from '../../model/trait-info';
import { useWorld } from '../../state/use-world';
import { Button, IconButton } from '../../ui/button';
import { Empty } from '../../ui/empty';
import { FilterIcon } from '../../ui/icons';
import { TextInput } from '../../ui/text-input';
import styles from './trait-list.module.css';
import { TraitRow } from './trait-row';

const TRAIT_TYPES: TraitType[] = ['tag', 'soa', 'aos', 'rel'];

interface TraitListProps {
  traits: Trait[];
  onSelect: (trait: Trait) => void;
}

export function TraitList({ traits, onSelect }: TraitListProps) {
  const world = useWorld();
  const [text, setText] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [hiddenTypes, setHiddenTypes] = useState<Set<TraitType>>(new Set());
  const [showEmpty, setShowEmpty] = useState(true);

  const toggleType = (type: TraitType) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const visibleTraits = useMemo(() => {
    const filter = text.trim();
    return traits
      .filter((trait) => {
        if (hiddenTypes.has(getTraitType(trait))) return false;
        if (!showEmpty && world.query(trait).length === 0) return false;
        return matchesTraitFilter(trait, filter);
      })
      .sort(compareTraitNames);
  }, [traits, text, hiddenTypes, showEmpty, world]);

  return (
    <>
      <div className={styles.toolbar}>
        <TextInput value={text} onChange={setText} placeholder="Filter…" />
        <IconButton
          active={showFilters}
          count={hiddenTypes.size}
          title="Filter by type"
          onClick={() => setShowFilters((prev) => !prev)}
        >
          <FilterIcon />
        </IconButton>
      </div>

      {showFilters && (
        <div className={styles.filters}>
          {TRAIT_TYPES.map((type) => (
            <Button key={type} active={!hiddenTypes.has(type)} onClick={() => toggleType(type)}>
              {type}
            </Button>
          ))}
          <Button
            active={showEmpty}
            title="Show traits with 0 entities"
            onClick={() => setShowEmpty((prev) => !prev)}
          >
            empty
          </Button>
        </div>
      )}

      {visibleTraits.length === 0 && (
        <Empty>{traits.length === 0 ? 'No traits registered' : 'No traits match filters'}</Empty>
      )}

      {visibleTraits.map((trait) => (
        <TraitRow key={getTraitId(trait)} trait={trait} onSelect={onSelect} />
      ))}
    </>
  );
}
