import type { Entity, Trait } from '@koota/core';
import { useMemo } from 'react';
import type { Editor } from '../../../types';
import { formatSource, getEditorUrl } from '../../model/debug-source';
import {
  getSchemaKeys,
  getTraitId,
  getTraitName,
  getTraitRelation,
  getTraitSource,
  getTraitType,
} from '../../model/trait-info';
import { useTraitEntities } from '../../state/use-world-data';
import { useWorld } from '../../state/use-world';
import { Page, PropertyList, Section } from '../../ui/page';
import { EntityList } from '../entities/entity-list';
import styles from './trait-detail.module.css';
import { TraitTypeBadge } from './trait-type-badge';

interface TraitDetailProps {
  trait: Trait;
  editor: Editor;
  onSelectEntity: (entity: Entity) => void;
}

export function TraitDetail({ trait, editor, onSelectEntity }: TraitDetailProps) {
  const world = useWorld();
  const entities = useTraitEntities(world, trait);
  const relation = getTraitRelation(trait);
  const source = getTraitSource(trait);
  const schemaKeys = getSchemaKeys(trait);

  const targets = useMemo(() => {
    if (!relation) return [];
    const unique = new Set<Entity>();
    for (const entity of entities) {
      for (const target of entity.targetsFor(relation)) unique.add(target);
    }
    return Array.from(unique);
  }, [relation, entities]);

  return (
    <Page
      title={getTraitName(trait)}
      subtitle={
        <>
          <span>id:{getTraitId(trait)}</span>
          {source && (
            <>
              <span>•</span>
              <a href={getEditorUrl(editor, source)} className={styles.source}>
                {formatSource(source)}
              </a>
            </>
          )}
        </>
      }
      actions={<TraitTypeBadge type={getTraitType(trait)} size="md" />}
    >
      {schemaKeys.length > 0 && (
        <Section label="Schema">
          <PropertyList
            items={schemaKeys.map((key) => {
              const value = (trait.schema as Record<string, unknown>)[key];
              return { label: key, value: typeof value === 'function' ? 'fn()' : String(value) };
            })}
          />
        </Section>
      )}

      {relation && (
        <Section label="Targets" count={targets.length}>
          <EntityList entities={targets} onSelect={onSelectEntity} emptyMessage="No targets" />
        </Section>
      )}

      <Section label="Entities" count={entities.length}>
        <EntityList entities={entities} onSelect={onSelectEntity} />
      </Section>
    </Page>
  );
}
