import { formatBytes, type WorldMemory } from '../../model/world-memory';
import styles from './memory-view.module.css';

interface Pool {
  key: 'masks' | 'entities' | 'stores';
  name: string;
  bytes: number;
  detail: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Where a world's memory goes. A bar shows the split between the pools, and each pool gets its
 * size up front with what makes it up underneath. Sizes are estimates calibrated for Chrome;
 * typed-array buffers are exact.
 */
export function MemoryView({ memory }: { memory: WorldMemory }) {
  const pools: Pool[] = [
    {
      key: 'masks',
      name: 'Masks',
      bytes: memory.maskBytes,
      detail: `${memory.maskSets} sets · ${plural(memory.maskGenerations, 'generation', 'generations')} · ${plural(memory.maskPages, 'page', 'pages')}`,
    },
    {
      key: 'entities',
      name: 'Entities',
      bytes: memory.entityBytes,
      detail: `${memory.entitiesAlive} alive of ${memory.entitySlots} slots · ${plural(memory.entityPages, 'page', 'pages')}`,
    },
    {
      key: 'stores',
      name: 'Trait data',
      bytes: memory.storeBytes,
      detail: [
        plural(memory.traitStores, 'store', 'stores'),
        `${memory.storeCells} cells`,
        memory.dataObjects > 0 && plural(memory.dataObjects, 'object', 'objects'),
        memory.dataStrings > 0 && plural(memory.dataStrings, 'string', 'strings'),
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ];
  const total = Math.max(memory.totalBytes, 1);

  return (
    <div className={styles.memory}>
      <div className={styles.bar} title={`≈ ${formatBytes(memory.totalBytes)} in total`}>
        {pools.map((pool) => (
          <span
            key={pool.key}
            className={`${styles.segment} ${styles[pool.key]}`}
            style={{ flexGrow: pool.bytes / total }}
          />
        ))}
      </div>

      {pools.map((pool) => (
        <div key={pool.key} className={styles.pool}>
          <span className={`${styles.swatch} ${styles[pool.key]}`} />
          <div className={styles.poolBody}>
            <div className={styles.poolLine}>
              <span className={styles.poolName}>{pool.name}</span>
              <span className={styles.poolSize}>{formatBytes(pool.bytes)}</span>
            </div>
            <div className={styles.poolDetail}>{pool.detail}</div>
          </div>
        </div>
      ))}

      <div className={styles.footer}>
        <span>{plural(memory.queries, 'query', 'queries')}</span>
        <span>{plural(memory.trackedTraits, 'tracked trait', 'tracked traits')}</span>
        <span className={styles.total}>≈ {formatBytes(memory.totalBytes)}</span>
      </div>
    </div>
  );
}
