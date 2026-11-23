import type { World } from '@koota/core';
import type { ReactNode } from 'react';
import { WorldProvider } from '../src';

export function withWorld(world: World) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <WorldProvider world={world}>{children}</WorldProvider>;
  };
}
