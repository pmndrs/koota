import type { Entity, Relation, Trait } from '@koota/core';
import { unpackEntity } from '@koota/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IsDevtoolsHovered } from '../../traits';
import { useWorld } from '../hooks/use-world';
import { Sheet } from './sheet';
import { EntityIcon } from './icons';
import styles from './entity-list-sheet.module.css';

interface EntityListSheetProps {
	title: string;
	relation: Relation<Trait>;
	target: Entity;
	onSelect: (entity: Entity) => void;
	onClose: () => void;
}

export function EntityListSheet({ title, relation, target, onSelect, onClose }: EntityListSheetProps) {
	const world = useWorld();
	const [filter, setFilter] = useState('');
	const [entities, setEntities] = useState<Entity[]>([]);
	const hoveredEntityRef = useRef<Entity | null>(null);

	// Function to get entities with the relation targeting our target
	const updateEntities = useCallback(() => {
		const result: Entity[] = [];
		// Query all entities with this relation (any target)
		const queryResult = world.query(relation('*'));
		for (const entity of queryResult) {
			const targets = entity.targetsFor(relation);
			if (targets.includes(target)) {
				result.push(entity);
			}
		}
		setEntities(result);
	}, [world, relation, target]);

	// Initial load and subscribe to changes
	useEffect(() => {
		updateEntities();

		let timeout: ReturnType<typeof setTimeout>;
		const scheduleUpdate = () => {
			clearTimeout(timeout);
			timeout = setTimeout(updateEntities, 50);
		};

		// Subscribe using the relation (listens to all targets)
		const unsubs = [
			world.onAdd(relation, scheduleUpdate),
			world.onRemove(relation, scheduleUpdate),
			world.onChange(relation, scheduleUpdate),
		];

		return () => {
			clearTimeout(timeout);
			unsubs.forEach((unsub) => unsub());
		};
	}, [world, relation, updateEntities]);

	const filteredEntities = useMemo(() => {
		// Filter out destroyed entities
		const alive = entities.filter((e) => world.has(e));
		if (!filter) return alive;
		const lowerFilter = filter.toLowerCase();
		return alive.filter((entity) => {
			const { entityId } = unpackEntity(entity);
			return `entity ${entityId}`.includes(lowerFilter) || `${entityId}`.includes(lowerFilter);
		});
	}, [entities, filter, world]);

	const clearHoveredEntity = () => {
		if (hoveredEntityRef.current && world.has(hoveredEntityRef.current)) {
			hoveredEntityRef.current.remove(IsDevtoolsHovered);
		}
		hoveredEntityRef.current = null;
	};

	const handleClose = () => {
		clearHoveredEntity();
		onClose();
	};

	return (
		<Sheet open={true} onClose={handleClose}>
			<Sheet.Header>{title}</Sheet.Header>
			<Sheet.Search
				value={filter}
				onChange={setFilter}
				placeholder={`Search ${filteredEntities.length} entities...`}
			/>
			<Sheet.List
				isEmpty={filteredEntities.length === 0}
				emptyMessage="No entities found"
			>
				{filteredEntities.map((entity) => {
					const { entityId } = unpackEntity(entity);
					return (
						<Sheet.Item
							key={entity}
							onClick={() => onSelect(entity)}
							onMouseEnter={() => {
								clearHoveredEntity();
								if (world.has(entity)) {
									entity.add(IsDevtoolsHovered);
									hoveredEntityRef.current = entity;
								}
							}}
							onMouseLeave={() => {
								if (world.has(entity)) entity.remove(IsDevtoolsHovered);
								if (hoveredEntityRef.current === entity) {
									hoveredEntityRef.current = null;
								}
							}}
						>
							<EntityIcon size={12} className={styles.entityIcon} />
							<span className={styles.entityName}>Entity {entityId}</span>
						</Sheet.Item>
					);
				})}
			</Sheet.List>
		</Sheet>
	);
}
