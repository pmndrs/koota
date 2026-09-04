import type { Entity, Trait } from '@koota/core';
import { unpackEntity } from '@koota/core';
import { formatSourceTitle } from '../../model/debug-source';
import {
  getTraitName,
  getTraitRelation,
  getTraitSource,
  getTraitType,
  hasInspectableData,
} from '../../model/trait-info';
import { Badge } from '../../ui/badge';
import { IconButton } from '../../ui/button';
import { Chevron } from '../../ui/icons';
import { Row, RowActions, RowName } from '../../ui/row';
import styles from './entity-detail.module.css';
import { TraitValueEditor } from './trait-value-editor';

interface EntityTraitRowProps {
  entity: Entity;
  trait: Trait;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onInspect: () => void;
}

/** One trait on an entity, with its values and relation targets underneath. */
export function EntityTraitRow({
  entity,
  trait,
  expanded,
  onToggle,
  onRemove,
  onInspect,
}: EntityTraitRowProps) {
  const relation = getTraitRelation(trait);
  const targets = relation ? entity.targetsFor(relation) : [];
  const source = getTraitSource(trait);
  const canExpand = hasInspectableData(trait);

  return (
    <div>
      <Row
        flat
        onClick={canExpand ? onToggle : undefined}
        title={source && formatSourceTitle(source)}
      >
        <Badge>{getTraitType(trait)}</Badge>
        <RowName>
          {getTraitName(trait)}
          {targets.length > 0 && (
            <span className={styles.targetCount}>
              {' '}
              ({targets.length} target{targets.length === 1 ? '' : 's'})
            </span>
          )}
        </RowName>
        {canExpand && <Chevron open={expanded} />}
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

      {expanded && canExpand && <TraitValueEditor entity={entity} trait={trait} />}

      {targets.length > 0 && (
        <div className={styles.targets}>
          {targets.map((target) => (
            <Row key={target} flat>
              <span className={styles.targetArrow}>→</span>
              <RowName>Entity {unpackEntity(target).entityId}</RowName>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}
