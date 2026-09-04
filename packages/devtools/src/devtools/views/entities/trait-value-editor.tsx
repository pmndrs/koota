import type { Entity, Trait } from '@koota/core';
import { useCallback, useEffect, useState } from 'react';
import { getTraitType } from '../../model/trait-info';
import { useWorld } from '../../state/use-world';
import { ObjectInspector, type ValuePath } from './object-inspector';
import styles from './trait-value-editor.module.css';

interface TraitValueEditorProps {
  entity: Entity;
  trait: Trait;
}

/** Write one field along a path inside a value, in place. */
function assignAt(root: unknown, path: ValuePath, value: unknown) {
  let target = root as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    target = target[path[i]] as Record<string, unknown>;
    if (typeof target !== 'object' || target === null) return;
  }
  target[path[path.length - 1]] = value;
}

/**
 * Live values of one trait on one entity, shown in the object inspector with double-click
 * editing of primitive leaves. Edits go through the entity so the world's change tracking
 * and every subscriber, systems and devtools alike, see them as a normal update.
 */
export function TraitValueEditor({ entity, trait }: TraitValueEditorProps) {
  const world = useWorld();
  const [value, setValue] = useState<unknown>(() => entity.get(trait));

  useEffect(() => {
    return world.onChange(trait, (changed) => {
      if (changed === entity) setValue(entity.get(trait));
    });
  }, [world, trait, entity]);

  const edit = useCallback(
    (path: ValuePath, next: unknown) => {
      entity.set(trait, ((current: unknown) => {
        assignAt(current, path, next);
        return current;
      }) as never);
      setValue(entity.get(trait));
    },
    [entity, trait]
  );

  const type = getTraitType(trait);
  if (type === 'tag') return <div className={styles.empty}>Tag trait (no data)</div>;
  if (value === undefined || value === null) return <div className={styles.empty}>No data</div>;

  return (
    <div className={styles.inspector}>
      <ObjectInspector data={value} onEdit={edit} hideRoot={type === 'soa'} defaultExpanded />
    </div>
  );
}
