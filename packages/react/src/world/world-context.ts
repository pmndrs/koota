import { World as WorldCore } from '@sweet-ecs/core';
import { createContext } from 'react';

export const WorldContext = createContext<WorldCore>(null!);
