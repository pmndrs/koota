import { trait } from 'koota';

export type Workload =
  'iteration' | 'churn' | 'traversal' | 'graph' | 'terms' | 'bulk' | 'structural' | 'render';

export const Metrics = trait(() => ({
  enabled: false,
  frameMs: 0,
  ticks: 0,
  systems: new Map<string, { workload: Workload; meanMs: number; calls: number }>(),
}));
