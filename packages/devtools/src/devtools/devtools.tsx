import type { Entity, Trait, World } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '../types';
import { getEntityInfo } from './model/entity-info';
import { getTraitId, getTraitType } from './model/trait-info';
import { getTab } from './state/nav';
import {
  HighlightProvider,
  useSelectionHighlight,
  useWorldHighlightTags,
} from './state/use-highlight';
import { useNav } from './state/use-nav';
import { useEntityCount, useWorldTraits } from './state/use-world-data';
import { useWorlds } from './state/use-worlds';
import { WorldProvider } from './state/use-world';
import { Panel } from './ui/panel/panel';
import { EntityDetail } from './views/entities/entity-detail';
import { WorldEntityList } from './views/entities/entity-list';
import { RelationGraph } from './views/graph/relation-graph';
import { Header } from './views/header';
import { TraitDetail } from './views/traits/trait-detail';
import { TraitList } from './views/traits/trait-list';
import { WorldDetail } from './views/worlds/world-detail';
import { WorldList } from './views/worlds/world-list';

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
  world: initialWorld,
  defaultPosition = { x: 16, y: 16 },
  defaultOpen = true,
  editor = 'cursor',
}: DevtoolsProps) {
  // The world being inspected. It starts as the one passed in and follows the worlds tab.
  const [world, setWorld] = useState(initialWorld);
  const worlds = useWorlds();
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
  const openWorld = (next: World) => {
    setWorld(next);
    send({ type: 'open-world', world: next });
  };

  // A destroyed world drops out of the universe; leave its detail screen.
  useEffect(() => {
    if (nav.screen === 'world-detail' && nav.world.isRegistered && !worlds.includes(nav.world)) {
      send({ type: 'world-destroyed', world: nav.world });
    }
  }, [nav, worlds, send]);

  const screenKey =
    nav.screen === 'world-detail'
      ? `world:${nav.world.id}`
      : nav.screen === 'entity-detail'
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
                worlds: Math.max(worlds.length, 1),
                entities: entityCount,
                traits: traits.length,
                graph: relationTraits.length,
              }}
              onShowTab={(tab) => send({ type: 'show-tab', tab })}
            />
          </Panel.Header>

          <Panel.Content scrollKey={screenKey} locked={nav.screen === 'graph'}>
            {nav.screen === 'world-list' &&
              (worlds.length > 1 ? (
                <WorldList worlds={worlds} activeWorld={world} onSelect={openWorld} />
              ) : (
                <WorldDetail world={world} onSelectTrait={openTrait} onSelectEntity={openEntity} />
              ))}
            {nav.screen === 'world-detail' && (
              <WorldDetail world={nav.world} onSelectTrait={openTrait} onSelectEntity={openEntity} />
            )}
            {nav.screen === 'entity-list' && <WorldEntityList onSelect={openEntity} />}
            {nav.screen === 'entity-detail' &&
              // The world entity is the world; both tabs land on the same page for it.
              (getEntityInfo(world, nav.entity).isWorld ? (
                <WorldDetail world={world} onSelectTrait={openTrait} onSelectEntity={openEntity} />
              ) : (
                <EntityDetail
                  key={nav.entity}
                  entity={nav.entity}
                  onSelectTrait={openTrait}
                  onSelectEntity={openEntity}
                />
              ))}
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
