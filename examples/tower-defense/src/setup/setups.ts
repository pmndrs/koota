export type SetupId =
  | 'balanced'
  | 'rain-field'
  | 'status-gauntlet'
  | 'articulated-battery'
  | 'target-turnover'
  | 'target-filtering'
  | 'wind-storm'
  | 'swarm-explosions';

export type Scale = 1 | 4 | 16 | 64;
export type QueryMode = 'required' | 'not' | 'or' | 'mixed';
export type EffectMode = 'overlapping' | 'single';

export const setups: { id: SetupId; name: string; description: string; focus: string }[] = [
  {
    id: 'balanced',
    name: 'Balanced battle',
    description: 'Survive six waves. Build, upgrade, and hold the line.',
    focus: 'All seven workloads',
  },
  {
    id: 'rain-field',
    name: 'Rainfall',
    description: 'A continuous rain field. More drops, unchanged composition.',
    focus: '1 · Stable read/write iteration',
  },
  {
    id: 'status-gauntlet',
    name: 'Status gauntlet',
    description: 'Dense waves cross flame and pulsing frost coverage.',
    focus: '2 · Dynamic composition',
  },
  {
    id: 'articulated-battery',
    name: 'Articulated battery',
    description: 'Eight transform nodes per tower, multiplied across lanes.',
    focus: '3 · Graph traversal + matrices',
  },
  {
    id: 'target-turnover',
    name: 'Target turnover',
    description: 'Fast enemies pass short-range towers and force target changes.',
    focus: '4 · Graph modification',
  },
  {
    id: 'target-filtering',
    name: 'Target filtering',
    description: 'Mixed enemies feed the cannon’s configurable priority query.',
    focus: '5 · Query terms',
  },
  {
    id: 'wind-storm',
    name: 'Wind storm',
    description: 'Stronger, flowing wind updates every raindrop’s velocity each tick.',
    focus: '6 · Bulk data mutation',
  },
  {
    id: 'swarm-explosions',
    name: 'Swarm explosions',
    description: 'Portals release groups. Cannon blasts leave groups of debris.',
    focus: '7 · Batch structural changes',
  },
];

export type SetupOptions = {
  setup?: SetupId;
  scale?: Scale;
  seed?: number;
  queryMode?: QueryMode;
  effectMode?: EffectMode;
  automatic?: boolean;
};

export function resolveSetup(options: SetupOptions = {}) {
  const setup = options.setup ?? 'balanced';
  const scale = options.scale ?? 1;
  if (!setups.some((item) => item.id === setup)) throw new Error(`Unknown setup: ${setup}`);
  if (![1, 4, 16, 64].includes(scale)) throw new Error('Scale must be 1, 4, 16, or 64');
  if (!Number.isSafeInteger(options.seed ?? 42)) throw new Error('Seed must be an integer');
  const queryMode = options.queryMode ?? 'mixed';
  const effectMode = options.effectMode ?? 'overlapping';
  if (!['required', 'not', 'or', 'mixed'].includes(queryMode)) throw new Error('Unknown query mode');
  if (!['single', 'overlapping'].includes(effectMode)) throw new Error('Unknown effect mode');
  const population = {
    balanced: { lanes: 8, towers: 12, enemies: 256, group: 32 },
    'rain-field': { lanes: 1, towers: 12, enemies: 256, group: 32 },
    'status-gauntlet': { lanes: 16, towers: 12, enemies: 512, group: 128 },
    'articulated-battery': { lanes: 32, towers: 16, enemies: 256, group: 32 },
    'target-turnover': { lanes: 32, towers: 16, enemies: 256, group: 32 },
    'target-filtering': { lanes: 16, towers: 12, enemies: 1024, group: 128 },
    'wind-storm': { lanes: 1, towers: 12, enemies: 256, group: 32 },
    'swarm-explosions': { lanes: 16, towers: 12, enemies: 512, group: 512 },
  }[setup];
  const particles = setup === 'rain-field' || setup === 'wind-storm';
  const lanes = population.lanes * (particles ? 1 : scale);
  return {
    setup,
    scale,
    seed: options.seed ?? 42,
    queryMode,
    effectMode,
    automatic: options.automatic ?? true,
    lanes,
    columns: Math.ceil(Math.sqrt(lanes)),
    rainCount: particles ? 8192 * scale : 1024,
    towersPerLane: population.towers,
    enemiesPerLane: population.enemies,
    groupSize: population.group,
    spawnInterval: setup === 'target-turnover' ? 0.65 : 1.6,
    windStrength: setup === 'wind-storm' ? 1.7 : 1,
    windSpeed: setup === 'wind-storm' ? 1.35 : 1,
    waveCount: 6,
  };
}

export type Setup = ReturnType<typeof resolveSetup>;

export function laneOrigin(config: Pick<Setup, 'columns' | 'lanes'>, lane: number) {
  return {
    x: ((lane % config.columns) - (config.columns - 1) / 2) * 54,
    z: (Math.floor(lane / config.columns) - (Math.ceil(config.lanes / config.columns) - 1) / 2) * 24,
  };
}

export function pathPoint(distance: number) {
  return { x: distance - 22, z: Math.sin(distance * 0.19) * 3.5 };
}

export function padPosition(pad: number) {
  const distance = 4 + Math.floor(pad / 2) * 5.1;
  const point = pathPoint(distance);
  return { x: point.x, z: point.z + (pad % 2 === 0 ? -4 : 4) };
}
