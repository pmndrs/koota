import type { Entity } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import { getEntityInfo } from '../../model/entity-info';
import { getTraitId } from '../../model/trait-info';
import { useEntityHover } from '../../state/use-highlight';
import { useWorld } from '../../state/use-world';
import { Empty } from '../../ui/empty';
import { EntityGlyph } from '../entities/entity-glyph';
import { buildTree, flattenTree, type RelationRecord, type TreeRow } from './graph-data';
import styles from './relation-tree.module.css';

interface RelationTreeProps {
  relations: RelationRecord[];
  /** Bumps when the world changes; triggers a rebuild. */
  version: number;
  onSelectEntity: (entity: Entity) => void;
}

const MAX_ROWS = 400;

function pickDefault(relations: RelationRecord[]): RelationRecord | null {
  return relations.find((r) => r.exclusive) ?? relations[0] ?? null;
}

/**
 * Outliner for one relation: targets are parents, sources are children. Exclusive relations
 * form a strict forest; for the others an entity with several targets appears under each.
 */
export function RelationTree({ relations, version, onSelectEntity }: RelationTreeProps) {
  const world = useWorld();
  const hover = useEntityHover();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<Entity>>(() => new Set());

  const relation =
    relations.find((r) => getTraitId(r.trait) === selectedId) ?? pickDefault(relations);

  // Keep the select in sync when the default was used or the chosen relation disappeared.
  useEffect(() => {
    if (relation && getTraitId(relation.trait) !== selectedId) {
      setSelectedId(getTraitId(relation.trait));
    }
  }, [relation, selectedId]);

  const tree = useMemo(
    () => (relation ? buildTree(world, relation) : null),
    // version is the change signal, not a value the tree reads
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, relation, version]
  );

  const rows = useMemo(() => (tree ? flattenTree(tree, collapsed) : []), [tree, collapsed]);

  const toggle = (entity: Entity) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(entity)) next.delete(entity);
      else next.add(entity);
      return next;
    });
  };

  if (!relation || !tree) {
    return <Empty>No relations to show</Empty>;
  }

  const total = new Set(rows.map((r) => r.entity)).size;

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
      <div className={styles.bar}>
        <select
          className={styles.select}
          value={getTraitId(relation.trait)}
          onChange={(e) => {
            setSelectedId(Number(e.target.value));
            setCollapsed(new Set());
          }}
          title={relation.exclusive ? 'Exclusive relation' : 'Non-exclusive relation'}
        >
          {relations.map((r) => (
            <option key={getTraitId(r.trait)} value={getTraitId(r.trait)}>
              {r.name}
              {r.exclusive ? '' : ' (multi)'}
            </option>
          ))}
        </select>
        <span className={styles.stats}>
          {tree.roots.length} root{tree.roots.length === 1 ? '' : 's'} · {total}{' '}
          {total === 1 ? 'entity' : 'entities'}
        </span>
      </div>

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
