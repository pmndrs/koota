import { World } from '@sweet-ecs/core';
import { Time } from './components/Time';

export const world = new World({ resources: Time });
