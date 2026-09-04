import type { World } from '@koota/core';
import { Row, RowCount, RowMeta, RowName } from '../../ui/row';
import { EntityGlyph } from '../entities/entity-glyph';
import styles from './world-row.module.css';

interface WorldRowProps {
  world: World;
  active: boolean;
  onSelect: (world: World) => void;
}

export function WorldRow({ world, active, onSelect }: WorldRowProps) {
  return (
    <Row onClick={() => onSelect(world)}>
      <EntityGlyph isWorld />
      <span className={styles.label}>
        <RowName>World {world.id}</RowName>
        {active && <RowMeta>inspecting</RowMeta>}
      </span>
      <RowCount>{world.entities.length}</RowCount>
    </Row>
  );
}
