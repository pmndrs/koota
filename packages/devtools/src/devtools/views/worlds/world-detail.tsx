import type { Entity, Trait, World } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import { useState } from 'react';
import { getTraitType } from '../../model/trait-info';
import { useEntityCount, useWorldTraits } from '../../state/use-world-data';
import { useWorldStorage } from '../../state/use-world-storage';
import { WorldProvider } from '../../state/use-world';
import { Button } from '../../ui/button';
import { Empty } from '../../ui/empty';
import { Page, PropertyList, Section } from '../../ui/page';
import { EntityGlyph } from '../entities/entity-glyph';
import { EntityTraits } from '../entities/entity-traits';
import { StorageView } from './storage-view';

interface WorldDetailProps {
  world: World;
  onSelectTrait: (trait: Trait) => void;
  onSelectEntity: (entity: Entity) => void;
}

/** One world: its counts, and the traits on its world entity. */
export function WorldDetail({ world, onSelectTrait, onSelectEntity }: WorldDetailProps) {
  const traits = useWorldTraits(world);
  const entityCount = useEntityCount(world);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const relationCount = traits.filter((trait) => getTraitType(trait) === 'rel').length;
  const worldEntity = world.isRegistered ? world[$internal].worldEntity : null;
  const storage = useWorldStorage(world);

  return (
    <WorldProvider value={world}>
      <Page
        title={
          <>
            <EntityGlyph isWorld size={14} />
            World {world.id}
          </>
        }
        actions={
          worldEntity !== null && (
            <Button onClick={() => setIsPickerOpen((prev) => !prev)} title="Add trait to world">
              + Add
            </Button>
          )
        }
      >
        <Section label="Metadata" summary={`id:${world.id}`}>
          <PropertyList
            items={[
              { label: 'ID', value: world.id },
              {
                label: 'World entity',
                value:
                  worldEntity === null
                    ? '—'
                    : `${unpackEntity(worldEntity).entityId} gen:${unpackEntity(worldEntity).generation}`,
              },
              { label: 'Entities', value: entityCount },
              { label: 'Traits', value: traits.length },
              { label: 'Relations', value: relationCount },
            ]}
          />
        </Section>

        <Section
          label="Storage"
          summary={
            storage.entityPages === 0
              ? 'No pages leased'
              : `${storage.entityPages} leased · ${storage.entityDensity}% dense`
          }
        >
          <StorageView storage={storage} />
        </Section>

        {worldEntity === null ? (
          <Empty inline>Not used yet; the world registers on its first spawn</Empty>
        ) : (
          <EntityTraits
            entity={worldEntity}
            onSelectTrait={onSelectTrait}
            onSelectEntity={onSelectEntity}
            pickerOpen={isPickerOpen}
            onClosePicker={() => setIsPickerOpen(false)}
          />
        )}
      </Page>
    </WorldProvider>
  );
}
