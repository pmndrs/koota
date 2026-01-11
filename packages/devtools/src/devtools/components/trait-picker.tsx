import type { Entity, Trait } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import type { Relation } from '@koota/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TraitWithDebug } from '../../types';
import { useWorldTraits } from '../hooks/use-world-traits';
import { useWorld } from '../hooks/use-world';
import badgeStyles from './badge.module.css';
import styles from './trait-picker.module.css';
import { getTraitName, getTraitType } from './trait-utils';
import { EntityIcon, WorldIcon } from './icons';
import { IsDevtoolsHovered } from '../../traits';
import { Sheet } from './sheet';

// Result can be either a regular trait or a relation pair
export type TraitPickerResult =
	| { type: 'trait'; trait: Trait }
	| { type: 'relation'; relation: Relation<Trait>; target: Entity };

interface TraitPickerProps {
	entity: Entity;
	currentTraits: Trait[];
	onSelect: (result: TraitPickerResult) => void;
	onClose: () => void;
}

export function TraitPicker({ entity, currentTraits, onSelect, onClose }: TraitPickerProps) {
	const world = useWorld();
	const allTraits = useWorldTraits(world);
	const [filter, setFilter] = useState('');

	// Track selected relation for second step (target picking)
	const [pendingRelation, setPendingRelation] = useState<{
		trait: Trait;
		relation: Relation<Trait>;
	} | null>(null);

	// Track hovered entity for cleanup
	const hoveredEntityRef = useRef<Entity | null>(null);

	// Track which traits are already on the entity
	const currentTraitSet = useMemo(() => new Set(currentTraits), [currentTraits]);

	// Filter by search term (but keep all traits, including those already added)
	const filteredTraits = useMemo(() => {
		if (!filter) return allTraits;
		const lowerFilter = filter.toLowerCase();
		return allTraits.filter((trait) => getTraitName(trait).toLowerCase().includes(lowerFilter));
	}, [allTraits, filter]);

	// Sort by name
	const sortedTraits = useMemo(
		() => [...filteredTraits].sort((a, b) => getTraitName(a).localeCompare(getTraitName(b))),
		[filteredTraits]
	);

	// Get all entities for target selection
	const allEntities = useMemo(() => [...world.entities], [world.entities]);

	// Filter entities for target selection
	const filteredEntities = useMemo(() => {
		if (!pendingRelation) return [];
		if (!filter) return allEntities;
		const lowerFilter = filter.toLowerCase();
		return allEntities.filter((ent) => {
			const { entityId } = unpackEntity(ent);
			const isWorldEntity = ent === world[$internal].worldEntity;
			const name = isWorldEntity ? `world` : `entity ${entityId}`;
			return name.includes(lowerFilter);
		});
	}, [allEntities, filter, pendingRelation, world]);

	// Clear filter when switching to target picker
	useEffect(() => {
		if (pendingRelation) setFilter('');
	}, [pendingRelation]);

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

	const handleTraitSelect = (trait: Trait) => {
		const type = getTraitType(trait);

		if (type === 'rel') {
			// It's a relation - show target picker
			const relation = trait[$internal].relation as Relation<Trait>;
			setPendingRelation({ trait, relation });
		} else {
			// Regular trait - select immediately
			onSelect({ type: 'trait', trait });
			handleClose();
		}
	};

	const handleTargetSelect = (target: Entity) => {
		if (!pendingRelation) return;
		onSelect({ type: 'relation', relation: pendingRelation.relation, target });
		handleClose();
	};

	const handleBack = () => {
		clearHoveredEntity();
		setPendingRelation(null);
		setFilter('');
	};

	// Handle escape to go back when picking target
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && pendingRelation) {
				e.stopPropagation();
				handleBack();
			}
		};

		document.addEventListener('keydown', handleEscape, true);
		return () => document.removeEventListener('keydown', handleEscape, true);
	}, [pendingRelation]);

	return (
		<Sheet open={true} onClose={handleClose}>
			{pendingRelation ? (
				<>
					<Sheet.Header onBack={handleBack}>
						Select target for{' '}
						<span className={styles.headerRelation}>
							{getTraitName(pendingRelation.trait)}
						</span>
					</Sheet.Header>
					<Sheet.Search
						value={filter}
						onChange={setFilter}
						placeholder="Search entities..."
					/>
					<Sheet.List
						isEmpty={filteredEntities.length === 0}
						emptyMessage="No entities match filter"
					>
						{filteredEntities.map((ent) => {
							const { entityId, worldId } = unpackEntity(ent);
							const isWorldEntity = ent === world[$internal].worldEntity;
							const isSelf = ent === entity;
							return (
								<Sheet.Item
									key={ent}
									className={isSelf ? styles.itemSelf : ''}
									onClick={() => handleTargetSelect(ent)}
									onMouseEnter={() => {
										clearHoveredEntity();
										if (world.has(ent)) {
											ent.add(IsDevtoolsHovered);
											hoveredEntityRef.current = ent;
										}
									}}
									onMouseLeave={() => {
										if (world.has(ent)) ent.remove(IsDevtoolsHovered);
										if (hoveredEntityRef.current === ent) {
											hoveredEntityRef.current = null;
										}
									}}
								>
									{isWorldEntity ? (
										<WorldIcon size={12} className={styles.entityIcon} />
									) : (
										<EntityIcon size={12} className={styles.entityIcon} />
									)}
									<span className={styles.itemName}>
										{isWorldEntity ? `World ${worldId}` : `Entity ${entityId}`}
									</span>
									{isSelf && <span className={styles.selfBadge}>self</span>}
								</Sheet.Item>
							);
						})}
					</Sheet.List>
				</>
			) : (
				<>
					<Sheet.Search
						value={filter}
						onChange={setFilter}
						placeholder="Search traits..."
					/>
					<Sheet.List
						isEmpty={sortedTraits.length === 0}
						emptyMessage="No traits match filter"
					>
						{sortedTraits.map((trait) => {
							const type = getTraitType(trait);
							const isRelation = type === 'rel';
							const isDisabled = !isRelation && currentTraitSet.has(trait);
							return (
								<Sheet.Item
									key={(trait as TraitWithDebug)[$internal]?.id}
									onClick={() => !isDisabled && handleTraitSelect(trait)}
									disabled={isDisabled}
								>
									<span className={`${badgeStyles.badge} ${badgeClasses[type]}`}>
										{type}
									</span>
									<span className={styles.itemName}>{getTraitName(trait)}</span>
									{isRelation && (
										<span className={styles.relationArrow}>→</span>
									)}
								</Sheet.Item>
							);
						})}
					</Sheet.List>
				</>
			)}
		</Sheet>
	);
}

const badgeClasses: Record<string, string> = {
	tag: badgeStyles.badgeTag,
	soa: badgeStyles.badgeSoa,
	aos: badgeStyles.badgeAos,
	rel: badgeStyles.badgeRel,
};
