import type { Entity } from '@koota/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePanel } from '../shared/panel';
import styles from './entity-list.module.css';
import { EntityRow } from './entity-row';

interface EntityListProps {
	entities: Entity[];
	onSelect?: (entity: Entity) => void;
	/** Use virtualization for large top-level lists. Disable for nested/detail contexts. */
	virtualized?: boolean;
}

const ROW_HEIGHT = 26;

export function EntityList({ entities, onSelect, virtualized = false }: EntityListProps) {
	if (entities.length === 0) {
		return <div className={styles.emptySmall}>No entities</div>;
	}

	if (!virtualized) {
		return (
			<div className={styles.entityList}>
				{entities.map((entity) => (
					<EntityRow
						key={entity}
						entity={entity}
						onSelect={onSelect ? () => onSelect(entity) : undefined}
					/>
				))}
			</div>
		);
	}

	return <VirtualEntityList entities={entities} onSelect={onSelect} />;
}

function VirtualEntityList({
	entities,
	onSelect,
}: {
	entities: Entity[];
	onSelect?: (entity: Entity) => void;
}) {
	const { scrollRef } = usePanel();
	const virtualizer = useVirtualizer({
		count: entities.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10,
	});

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
