import type { Entity } from '@koota/core';
import { useMemo, useState } from 'react';
import { getEntityInfo } from '../../model/entity-info';
import { useEntityHover } from '../../state/use-highlight';
import { useWorld } from '../../state/use-world';
import { Empty } from '../../ui/empty';
import { EntityGlyph } from '../entities/entity-glyph';
import { buildTree, flattenTree, type RelationRecord, type TreeRow } from './graph-data';
import styles from './relation-tree.module.css';

interface RelationTreeProps {
  relation: RelationRecord;
  /** Bumps when the world changes; triggers a rebuild. */
  version: number;
  onSelectEntity: (entity: Entity) => void;
}

const MAX_ROWS = 400;

/**
 * Outliner for one relation: targets are parents, sources are children. Exclusive relations
 * form a strict forest; for the others an entity with several targets appears under each.
 */
export function RelationTree({ relation, version, onSelectEntity }: RelationTreeProps) {
  const world = useWorld();
  const hover = useEntityHover();
  const [collapsed, setCollapsed] = useState<Set<Entity>>(() => new Set());

  const tree = useMemo(
    () => buildTree(world, relation),
    // version is the change signal, not a value the tree reads
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, relation, version]
  );

  const rows = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

  const toggle = (entity: Entity) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  };

  const renderRow = (row: TreeRow, index: number) => {
    const info = getEntityInfo(world, row.entity);
    const isCollapsed = collapsed.has(row.entity);
    const expandable = row.childCount > 0 && !row.repeated;
    return (
      <div
        key={`${row.entity}-${row.depth}-${index}`}
        className={styles.row}
        style={{ paddingLeft: 8 + row.depth * 12 }}
        onClick={() => onSelectEntity(row.entity)}
        onMouseEnter={() => hover.hover(row.entity)}
        onMouseLeave={() => hover.unhover(row.entity)}
      >
        {expandable ? (
          <button
            className={styles.chevron}
            onClick={(e) => {
              e.stopPropagation();
              toggle(row.entity);
            }}
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? '▶' : '▼'}
          </button>
        ) : (
          <span className={styles.chevronSpacer} />
        )}
        <EntityGlyph isWorld={info.isWorld} size={11} />
        <span className={styles.name}>{info.label}</span>
        {row.repeated ? (
          <span className={styles.meta} title="Already shown above">
            ↺
          </span>
        ) : (
          row.childCount > 0 && <span className={styles.meta}>{row.childCount}</span>
        )}
      </div>
    );
  };

  return (
    <div className={styles.tree}>
      <div className={styles.rows}>
        {rows.length === 0 ? (
          <Empty inline>No entities use {relation.name}</Empty>
        ) : (
          rows.slice(0, MAX_ROWS).map(renderRow)
        )}
        {rows.length > MAX_ROWS && (
          <div className={styles.notice}>
            {rows.length - MAX_ROWS} more rows hidden. Collapse branches to see them.
          </div>
        )}

        {tree.dangling.length > 0 && (
          <>
            <div className={styles.sectionLabel}>Dangling ({tree.dangling.length})</div>
            {tree.dangling
              .slice(0, 50)
              .map((entity, index) =>
                renderRow({ entity, depth: 0, childCount: 0, repeated: false }, index)
              )}
          </>
        )}
      </div>
    </div>
  );
}
