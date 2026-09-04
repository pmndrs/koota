import type { Entity, Trait } from '@koota/core';
import { useState } from 'react';
import { getEntityInfo } from '../../model/entity-info';
import { useWorld } from '../../state/use-world';
import { Button } from '../../ui/button';
import { Page, PropertyList, Section } from '../../ui/page';
import { EntityGlyph } from './entity-glyph';
import { EntityTraits } from './entity-traits';

interface EntityDetailProps {
  entity: Entity;
  onSelectTrait: (trait: Trait) => void;
  onSelectEntity: (entity: Entity) => void;
}

export function EntityDetail({ entity, onSelectTrait, onSelectEntity }: EntityDetailProps) {
  const world = useWorld();
  const info = getEntityInfo(world, entity);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  return (
    <Page
      title={
        <>
          <EntityGlyph isWorld={info.isWorld} size={14} />
          {info.label}
        </>
      }
      actions={
        <Button onClick={() => setIsPickerOpen((prev) => !prev)} title="Add trait to entity">
          + Add
        </Button>
      }
    >
      <Section label="Metadata" summary={`id:${info.id} gen:${info.generation}`}>
        <PropertyList
          items={[
            { label: 'ID', value: info.id },
            { label: 'Generation', value: info.generation },
            { label: 'World', value: info.worldId },
            { label: 'Raw', value: String(entity) },
          ]}
        />
      </Section>

      <EntityTraits
        entity={entity}
        onSelectTrait={onSelectTrait}
        onSelectEntity={onSelectEntity}
        pickerOpen={isPickerOpen}
        onClosePicker={() => setIsPickerOpen(false)}
      />
    </Page>
  );
}
