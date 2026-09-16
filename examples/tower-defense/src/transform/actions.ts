import { createActions, type Entity, type TraitRecord } from 'koota';
import {
  Appearance,
  ChildOf,
  Children,
  IsTransformRoot,
  LocalMatrix,
  LocalTransform,
  WorldMatrix,
} from './traits';

export const transformActions = createActions((world) => ({
  spawnNode: (
    local: Partial<TraitRecord<typeof LocalTransform>>,
    appearance?: Partial<TraitRecord<typeof Appearance>>,
    parent?: Entity
  ) => {
    const entity = world.spawn(LocalTransform(local), LocalMatrix, WorldMatrix, Children);
    if (parent !== undefined) entity.add(ChildOf(parent));
    else entity.add(IsTransformRoot);
    if (appearance) entity.add(Appearance(appearance));
    return entity;
  },
}));
