import type { Entity, Trait, World } from '@koota/core';
import { createContext, createElement, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  IsDevtoolsHighlighting,
  IsDevtoolsHovered,
  IsDevtoolsHovering,
  IsDevtoolsSelected,
  IsDevtoolsSelecting,
} from '../../traits';

export interface EntityHover {
  hover(entity: Entity): void;
  unhover(entity: Entity): void;
}

const HoverContext = createContext<EntityHover | null>(null);

/**
 * Only one entity carries IsDevtoolsHovered at a time. Rows report enter and
 * leave here so the tag stays consistent even when a row unmounts mid hover
 * or two rows overlap during a list update.
 */
export function HighlightProvider({ world, children }: { world: World; children: ReactNode }) {
  const hoveredRef = useRef<Entity | null>(null);

  const hover = useMemo<EntityHover>(() => {
    const clear = () => {
      const current = hoveredRef.current;
      if (current !== null && world.has(current)) current.remove(IsDevtoolsHovered);
      hoveredRef.current = null;
    };

    return {
      hover(entity) {
        clear();
        if (!world.has(entity)) return;
        entity.add(IsDevtoolsHovered);
        hoveredRef.current = entity;
      },
      unhover(entity) {
        if (hoveredRef.current === entity) clear();
      },
    };
  }, [world]);

  useEffect(() => {
    return () => {
      const current = hoveredRef.current;
      if (current !== null && world.has(current)) current.remove(IsDevtoolsHovered);
    };
  }, [world]);

  return createElement(HoverContext.Provider, { value: hover }, children);
}

export function useEntityHover(): EntityHover {
  const hover = useContext(HoverContext);
  if (!hover) throw new Error('useEntityHover must be used within devtools');
  return hover;
}

/** Keeps IsDevtoolsSelected on the entity that is open in the detail screen. */
export function useSelectionHighlight(world: World, entity: Entity | null) {
  useEffect(() => {
    if (entity === null || !world.has(entity)) return;

    entity.remove(IsDevtoolsHovered);
    entity.add(IsDevtoolsSelected);

    return () => {
      if (world.has(entity)) entity.remove(IsDevtoolsSelected);
    };
  }, [world, entity]);
}

function setWorldTag(world: World, tag: Trait, on: boolean) {
  if (world.has(tag) === on) return;
  if (on) world.add(tag);
  else world.remove(tag);
}

/**
 * Mirrors entity hover and selection onto the world as tags an app can query
 * for global feedback. The sync runs in a microtask so it observes the world
 * after the triggering add or remove has fully settled.
 */
export function useWorldHighlightTags(world: World) {
  useEffect(() => {
    let scheduled = false;

    const sync = () => {
      const hovering = world.query(IsDevtoolsHovered).length > 0;
      const selecting = world.query(IsDevtoolsSelected).length > 0;
      setWorldTag(world, IsDevtoolsHovering, hovering);
      setWorldTag(world, IsDevtoolsSelecting, selecting);
      setWorldTag(world, IsDevtoolsHighlighting, hovering || selecting);
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        sync();
      });
    };

    sync();
    const unsubscribes = [
      world.onAdd(IsDevtoolsHovered, schedule),
      world.onRemove(IsDevtoolsHovered, schedule),
      world.onAdd(IsDevtoolsSelected, schedule),
      world.onRemove(IsDevtoolsSelected, schedule),
    ];

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      setWorldTag(world, IsDevtoolsHovering, false);
      setWorldTag(world, IsDevtoolsSelecting, false);
      setWorldTag(world, IsDevtoolsHighlighting, false);
    };
  }, [world]);
}
