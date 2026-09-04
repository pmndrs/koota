import type { World } from '@koota/core';
import { VirtualList } from '../../ui/virtual-list';
import { WorldRow } from './world-row';

interface WorldListProps {
  worlds: World[];
  activeWorld: World;
  onSelect: (world: World) => void;
}

/** Every registered world; there can be thousands, so rows are virtualized. */
export function WorldList({ worlds, activeWorld, onSelect }: WorldListProps) {
  return (
    <VirtualList
      items={worlds}
      keyOf={(world) => world.id}
      renderRow={(world) => (
        <WorldRow world={world} active={world === activeWorld} onSelect={onSelect} />
      )}
      emptyMessage="No worlds yet"
    />
  );
}
