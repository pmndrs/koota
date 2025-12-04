import type { Entity } from '@koota/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { RefObject } from 'react';
import styles from './entity-list.module.css';
import { EntityRow } from './entity-row';

interface EntityListProps {
	entities: Entity[];
	scrollRef: RefObject<HTMLDivElement | null>;
	onSelect?: (entity: Entity) => void;
}

const ROW_HEIGHT = 26;

export function EntityList({ entities, scrollRef, onSelect }: EntityListProps) {
	const virtualizer = useVirtualizer({
		count: entities.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10,
	});

	if (entities.length === 0) {
		return <div className={styles.emptySmall}>No entities</div>;
	}

	return (
		<div
			className={styles.entityList}
			style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
		>
			{virtualizer.getVirtualItems().map((virtualItem) => {
				const entity = entities[virtualItem.index];
				return (
					<div
						key={entity}
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							width: '100%',
							height: ROW_HEIGHT,
							transform: `translateY(${virtualItem.start}px)`,
						}}
					>
						<EntityRow
							entity={entity}
							onSelect={onSelect ? () => onSelect(entity) : undefined}
						/>
					</div>
				);
			})}
		</div>
	);
}
