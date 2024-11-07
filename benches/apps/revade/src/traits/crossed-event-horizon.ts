import { trait, Entity } from "koota";

export const CrossedEventHorizon = trait<{
  blackHoleEntity: Entity,
}>({
  blackHoleEntity: -1 as Entity,
});