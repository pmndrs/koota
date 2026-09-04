import type { Entity, Trait, World } from '@koota/core';
import { useMemo } from 'react';
import type { Editor } from '../types';
import { getTraitId, getTraitType } from './model/trait-info';
import { getTab } from './state/nav';
import {
  HighlightProvider,
  useSelectionHighlight,
  useWorldHighlightTags,
} from './state/use-highlight';
import { useNav } from './state/use-nav';
import { useEntityCount, useWorldTraits } from './state/use-world-data';
import { WorldProvider } from './state/use-world';
import { Panel } from './ui/panel/panel';
import { EntityDetail } from './views/entities/entity-detail';
import { WorldEntityList } from './views/entities/entity-list';
import { RelationGraph } from './views/graph/relation-graph';
import { Header } from './views/header';
import { TraitDetail } from './views/traits/trait-detail';
import { TraitList } from './views/traits/trait-list';

export interface DevtoolsProps {
  world: World;
  defaultPosition?: { x: number; y: number };
  defaultOpen?: boolean;
  editor?: Editor;
}

/**
 * The root of the panel. It owns the navigation machine and the world
 * subscriptions every screen needs, and hands each screen the events it
 * can send.
 */
export function Devtools({
  world,
  defaultPosition = { x: 16, y: 16 },
  defaultOpen = true,
  editor = 'cursor',
}: DevtoolsProps) {
  const traits = useWorldTraits(world);
  const entityCount = useEntityCount(world);
  const { nav, send } = useNav(world, traits);

  const relationTraits = useMemo(
    () => traits.filter((trait) => getTraitType(trait) === 'rel'),
    [traits]
  );

  useSelectionHighlight(world, nav.screen === 'entity-detail' ? nav.entity : null);
  useWorldHighlightTags(world);

  const openEntity = (entity: Entity) => send({ type: 'open-entity', entity });
  const openTrait = (trait: Trait) => send({ type: 'open-trait', trait });

  const screenKey =
    nav.screen === 'entity-detail'
      ? `entity:${nav.entity}`
      : nav.screen === 'trait-detail'
        ? `trait:${getTraitId(nav.trait)}`
        : nav.screen;

  return (
    <WorldProvider value={world}>
      <HighlightProvider world={world}>
        <Panel defaultPosition={defaultPosition} defaultOpen={defaultOpen}>
          <Panel.Header>
            <Header
              tab={getTab(nav)}
              counts={{
                entities: entityCount,
                traits: traits.length,
                graph: relationTraits.length,
              }}
              onShowTab={(tab) => send({ type: 'show-tab', tab })}
            />
          </Panel.Header>

          <Panel.Content scrollKey={screenKey} locked={nav.screen === 'graph'}>
            {nav.screen === 'entity-list' && <WorldEntityList onSelect={openEntity} />}
            {nav.screen === 'entity-detail' && (
              <EntityDetail
                key={nav.entity}
                entity={nav.entity}
                onSelectTrait={openTrait}
                onSelectEntity={openEntity}
              />
            )}
            {nav.screen === 'trait-list' && <TraitList traits={traits} onSelect={openTrait} />}
            {nav.screen === 'trait-detail' && (
              <TraitDetail
                key={getTraitId(nav.trait)}
                trait={nav.trait}
                editor={editor}
                onSelectEntity={openEntity}
              />
            )}
            {nav.screen === 'graph' && (
              <RelationGraph relationTraits={relationTraits} onSelectEntity={openEntity} />
            )}
          </Panel.Content>
        </Panel>
      </HighlightProvider>
    </WorldProvider>
  );
}
