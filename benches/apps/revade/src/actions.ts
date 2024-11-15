import {TraitValue} from 'koota';
import {createActions} from 'koota/react';
import {AutoRotate, Avoidance, Bullet, Input, IsEnemy, IsPlayer, Movement, Transform,} from './traits';
import * as THREE from 'three';
import {Vector3} from 'three';
import {Score} from "./traits/score.ts";
import {DirectionBased} from "./traits/direction-based.ts";
import {IsBomb} from "./traits/is-bomb.ts";

type TransformValue = TraitValue<(typeof Transform)['schema']>;

export const useActions = createActions((world) => ({
  spawnPlayer: (transform?: TransformValue) => {
    return world.spawn(IsPlayer, Movement, Input, Transform(transform), Score);
  },
  spawnEnemy: (transform?: TransformValue) => {

    return world.spawn(
      IsEnemy,
      Movement({thrust: 0.5, damping: 0.98}),
      Transform(transform),
      AutoRotate,
      Avoidance
    );
  },
  spawnBullet: (position: THREE.Vector3, target: Vector3, directionBased?: boolean) => {

    if (directionBased) {
      return world.spawn(
        Transform({position: position.clone()}),
        Bullet({target, speed: 100, lifetime: 2}),
        DirectionBased
      );
    } else {
      return world.spawn(
        Transform({position: position.clone()}),
        Bullet({target, speed: 100, lifetime: 2}),
      );
    }
  },
  spawnBomb: (position: THREE.Vector3, target: Vector3, directionBased?: boolean) => {

    if (directionBased) {
      return world.spawn(
        Transform({position: position.clone()}),
        Bullet({target, speed: 100, lifetime: 2}),
        DirectionBased,
        IsBomb
      );
    } else {
      return world.spawn(
        Transform({position: position.clone()}),
        Bullet({target, speed: 100, lifetime: 2}),
        IsBomb
      );
    }
  },
}));
