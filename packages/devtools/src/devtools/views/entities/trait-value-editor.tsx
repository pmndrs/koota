import type { Entity, Trait } from '@koota/core';
import { useEffect, useState } from 'react';
import { getSchemaKeys, getTraitType } from '../../model/trait-info';
import { useWorld } from '../../state/use-world';
import { ObjectInspector } from './object-inspector';
import styles from './trait-value-editor.module.css';

type Values = Record<string, unknown>;

interface TraitValueEditorProps {
  entity: Entity;
  trait: Trait;
}

/**
 * Live values of one trait on one entity. SoA fields with primitive values
 * are editable inline, everything else opens in the object inspector.
 */
export function TraitValueEditor({ entity, trait }: TraitValueEditorProps) {
  const world = useWorld();
  const [values, setValues] = useState<Values>(() => (entity.get(trait) as Values) ?? {});

  useEffect(() => {
    return world.onChange(trait, (changed) => {
      if (changed !== entity) return;
      const next = entity.get(trait) as Values | undefined;
      if (next) setValues(next);
    });
  }, [world, trait, entity]);

  const type = getTraitType(trait);

  if (type === 'tag') return <div className={styles.empty}>Tag trait (no data)</div>;

  if (type === 'aos') {
    return (
      <div className={styles.inspector}>
        <ObjectInspector data={values} />
      </div>
    );
  }

  const keys = getSchemaKeys(trait);
  if (keys.length === 0) return <div className={styles.empty}>No data</div>;

  const setField = (key: string, value: unknown) => {
    const next = { ...values, [key]: value };
    setValues(next);
    entity.set(trait, next);
  };

  return (
    <div className={styles.editor}>
      {keys.map((key) => (
        <div key={key} className={styles.field}>
          <label className={styles.key}>{key}</label>
          <div className={styles.value}>
            <FieldInput value={values[key]} onChange={(value) => setField(key, value)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldInput({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  switch (typeof value) {
    case 'number':
      return (
        <input
          type="number"
          className={styles.input}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          onClick={(e) => e.currentTarget.select()}
        />
      );
    case 'string':
      return (
        <input
          type="text"
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.currentTarget.select()}
        />
      );
    case 'boolean':
      return (
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    default:
      return <ObjectInspector data={value} />;
  }
}
