import { createWorld } from '@sweet-ecs/core';
import { Time } from './components/Time';

export const world = createWorld({ resources: Time });
