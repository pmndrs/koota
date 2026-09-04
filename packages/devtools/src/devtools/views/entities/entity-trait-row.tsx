import type { Entity, Trait } from '@koota/core';
import { useState } from 'react';
import { formatSourceTitle } from '../../model/debug-source';
import { getEntityInfo } from '../../model/entity-info';
import {
  getTraitName,
  getTraitRelation,
  getTraitSource,
  getTraitType,
  hasInspectableData,
} from '../../model/trait-info';
import { useEntityHover } from '../../state/use-highlight';
import { useWorld } from '../../state/use-world';
import { IconButton } from '../../ui/button';
import { Chevron } from '../../ui/icons';
import { Row, RowActions, RowName } from '../../ui/row';
import { TraitTypeBadge } from '../traits/trait-type-badge';
import styles from './entity-detail.module.css';
import { EntityGlyph } from './entity-glyph';
import { TraitValueEditor } from './trait-value-editor';

interface EntityTraitRowProps {
  entity: Entity;
  trait: Trait;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onInspect: () => void;
  onSelectEntity: (entity: Entity) => void;
}

/**
 * One trait on an entity. Data traits expand to their values; relation traits expand to
 * their targets, collapsed by default since a relation can point at many entities.
 */
export function EntityTraitRow({
  entity,
  trait,
  expanded,
  onToggle,
  onRemove,
  onInspect,
  onSelectEntity,
}: EntityTraitRowProps) {
  const world = useWorld();
  const hover = useEntityHover();
  const relation = getTraitRelation(trait);
  const targets = relation ? entity.targetsFor(relation) : [];
  const source = getTraitSource(trait);
  const [showTargets, setShowTargets] = useState(false);
  const canExpandValues = hasInspectableData(trait);
  const canExpandTargets = targets.length > 0;
  const canExpand = canExpandValues || canExpandTargets;
  const isOpen = canExpandTargets ? showTargets : expanded;

  const toggle = () => {
    if (canExpandTargets) setShowTargets((prev) => !prev);
    else onToggle();
  };

  return (
    <div>
      <Row flat onClick={canExpand ? toggle : undefined} title={source && formatSourceTitle(source)}>
        <TraitTypeBadge type={getTraitType(trait)} />
        <RowName>
          {getTraitName(trait)}
          {canExpandTargets && <span className={styles.targetCount}> ({targets.length})</span>}
        </RowName>
        {canExpand && <Chevron open={isOpen} />}
        <RowActions>
          <IconButton
            size="sm"
            danger
            title="Remove trait"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            ×
          </IconButton>
          <IconButton
            size="sm"
            title="View trait details"
            onClick={(e) => {
              e.stopPropagation();
              onInspect();
            }}
          >
            ⓘ
          </IconButton>
        </RowActions>
      </Row>

      {expanded && canExpandValues && !canExpandTargets && (
        <TraitValueEditor entity={entity} trait={trait} />
      )}

      {showTargets && canExpandTargets && (
        <div className={styles.targets}>
          {targets.map((target) => {
            const info = getEntityInfo(world, target);
            return (
              <Row
                key={target}
                onClick={() => onSelectEntity(target)}
                onMouseEnter={() => hover.hover(target)}
                onMouseLeave={() => hover.unhover(target)}
                title="Go to entity"
              >
                <span className={styles.targetArrow}>→</span>
                <EntityGlyph isWorld={info.isWorld} size={14} />
                <RowName>{info.label}</RowName>
              </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}
