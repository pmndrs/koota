import type { World } from '@koota/core';
import { createContext } from 'react';

export const WorldContext = createContext<World>(null!);
