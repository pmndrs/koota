import type { Entity } from '@koota/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { RefObject } from 'react';
import styles from '../styles.module.css';
import { EntityRow } from './entity-row';

interface EntityListProps {
	entities: Entity[];
	scrollRef: RefObject<HTMLDivElement | null>;
}

const ROW_HEIGHT = 26;

export function EntityList({ entities, scrollRef }: EntityListProps) {
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
			{virtualizer.getVirtualItems().map((virtualItem) => (
				<div
					key={entities[virtualItem.index]}
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						width: '100%',
						height: ROW_HEIGHT,
						transform: `translateY(${virtualItem.start}px)`,
					}}
				>
					<EntityRow entity={entities[virtualItem.index]} />
				</div>
			))}
		</div>
	);
}
