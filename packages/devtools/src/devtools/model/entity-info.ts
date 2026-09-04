import { $internal, type Entity, type Trait, type World, unpackEntity } from '@koota/core';

export interface EntityInfo {
  id: number;
  generation: number;
  worldId: number;
  isWorld: boolean;
  label: string;
}

export function getEntityInfo(world: World, entity: Entity): EntityInfo {
  const { entityId, generation } = unpackEntity(entity);
  const isWorld = entity === world[$internal].worldEntity;

  return {
    id: entityId,
    generation,
    worldId: world.id,
    isWorld,
    label: isWorld ? `World ${world.id}` : `Entity ${entityId}`,
  };
}

export function getEntityTraits(world: World, entity: Entity): Trait[] {
  return [...(world[$internal].entityTraits.get(entity) ?? [])];
}

export function getEntityTraitCount(world: World, entity: Entity): number {
  return world[$internal].entityTraits.get(entity)?.size ?? 0;
}

export function matchesEntityFilter(info: EntityInfo, filter: string): boolean {
  return info.label.toLowerCase().includes(filter.toLowerCase());
}
