import type { Entity } from '@koota/core';
import { useEffect } from 'react';
import { getEntityInfo, getEntityTraitCount } from '../../model/entity-info';
import { useEntityHover } from '../../state/use-highlight';
import { useWorld } from '../../state/use-world';
import { Row, RowCount, RowMeta, RowName } from '../../ui/row';
import { EntityGlyph } from './entity-glyph';
import styles from './entity-row.module.css';

interface EntityRowProps {
  entity: Entity;
  onSelect?: (entity: Entity) => void;
}

export function EntityRow({ entity, onSelect }: EntityRowProps) {
  const world = useWorld();
  const hover = useEntityHover();
  const info = getEntityInfo(world, entity);
  const traitCount = getEntityTraitCount(world, entity);

  useEffect(() => () => hover.unhover(entity), [hover, entity]);

  return (
    <Row
      onClick={onSelect && (() => onSelect(entity))}
      onMouseEnter={() => hover.hover(entity)}
      onMouseLeave={() => hover.unhover(entity)}
    >
      <EntityGlyph isWorld={info.isWorld} />
      <span className={styles.label}>
        <RowName>{info.label}</RowName>
        <RowMeta>gen:{info.generation}</RowMeta>
      </span>
      <RowCount>{traitCount}</RowCount>
    </Row>
  );
}
