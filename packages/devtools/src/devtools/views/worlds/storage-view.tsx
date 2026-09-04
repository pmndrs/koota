import type { WorldStorage } from '../../model/world-storage';
import { PropertyList } from '../../ui/page';

function formatCount(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** The storage pressure and bookkeeping signals that are useful at a glance. */
export function StorageView({ storage }: { storage: WorldStorage }) {
  return (
    <PropertyList
      items={[
        {
          label: 'Pages leased',
          value: storage.entityPages,
        },
        {
          label: 'Density',
          value:
            storage.entityCapacity === 0
              ? '—'
              : `${storage.entityDensity}% · ${storage.entitiesAlive}/${storage.entityCapacity}`,
        },
        {
          label: 'Mask pages',
          value: `${storage.entityMaskPages} entity · ${storage.trackingMaskPages} tracking`,
        },
        {
          label: 'Tracking',
          value: `${formatCount(storage.trackers, 'tracker')} · ${formatCount(storage.trackedTraits, 'trait')}`,
        },
      ]}
    />
  );
}
