import type { Entity, Trait } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import type { Relation } from '@koota/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TraitWithDebug } from '../../types';
import { useWorldTraits } from '../hooks/use-world-traits';
import { useWorld } from '../hooks/use-world';
import { Panel } from './panel';
import badgeStyles from './badge.module.css';
import styles from './trait-picker.module.css';
import { getTraitName, getTraitType } from './trait-utils';
import { EntityIcon, WorldIcon } from './icons';
import { IsDevtoolsHovered } from '../../traits';

// Result can be either a regular trait or a relation pair
export type TraitPickerResult =
	| { type: 'trait'; trait: Trait }
	| { type: 'relation'; relation: Relation<Trait>; target: Entity };

interface TraitPickerProps {
	entity: Entity;
	currentTraits: Trait[];
	onSelect: (result: TraitPickerResult) => void;
	onClose: () => void;
	anchorRef?: React.RefObject<HTMLElement>;
}

export function TraitPicker({
	entity,
	currentTraits,
	onSelect,
	onClose,
	anchorRef: _anchorRef,
}: TraitPickerProps) {
	const world = useWorld();
	const allTraits = useWorldTraits(world);
	const [filter, setFilter] = useState('');
	const [isAnimatingOut, setIsAnimatingOut] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const backdropRef = useRef<HTMLDivElement>(null);

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

	// Focus input on mount and when switching modes
	useEffect(() => {
		inputRef.current?.focus();
	}, [pendingRelation]);

	// Clear filter when switching to target picker
	useEffect(() => {
		if (pendingRelation) setFilter('');
	}, [pendingRelation]);

	// Handle backdrop click
	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === backdropRef.current) {
			handleClose();
		}
	};

	// Handle escape key - go back if picking target, otherwise close
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				if (pendingRelation) {
					clearHoveredEntity();
					setPendingRelation(null);
					setFilter('');
				} else {
					handleClose();
				}
			}
		};

		document.addEventListener('keydown', handleEscape);
		return () => document.removeEventListener('keydown', handleEscape);
	}, [pendingRelation]);

	const clearHoveredEntity = () => {
		if (hoveredEntityRef.current && world.has(hoveredEntityRef.current)) {
			hoveredEntityRef.current.remove(IsDevtoolsHovered);
		}
		hoveredEntityRef.current = null;
	};

	const handleClose = () => {
		if (isAnimatingOut) return; // Prevent double-close
		clearHoveredEntity();
		setIsAnimatingOut(true);
		// Wait for animation to complete before actually closing
		setTimeout(() => {
			onClose();
		}, 450); // Match exit animation duration
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

	return (
		<Panel.Portal>
			<div
				ref={backdropRef}
				className={`${styles.backdrop} ${isAnimatingOut ? styles.backdropExit : ''}`}
				onClick={handleBackdropClick}
			>
				<div
					ref={containerRef}
					className={`${styles.sheet} ${isAnimatingOut ? styles.sheetExit : ''}`}
				>
					{pendingRelation ? (
						// Target picker for relation
						<>
							<div className={styles.header}>
								<button className={styles.backButton} onClick={handleBack}>
									←
								</button>
								<span className={styles.headerTitle}>
									Select target for{' '}
									<span className={styles.headerRelation}>
										{getTraitName(pendingRelation.trait)}
									</span>
								</span>
							</div>
							<input
								ref={inputRef}
								type="text"
								className={styles.input}
								placeholder="Search entities..."
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
							/>
							<div className={styles.list}>
								{filteredEntities.length === 0 ? (
									<div className={styles.empty}>No entities match filter</div>
								) : (
									filteredEntities.map((ent) => {
										const { entityId, worldId } = unpackEntity(ent);
										const isWorldEntity = ent === world[$internal].worldEntity;
										const isSelf = ent === entity;
										return (
											<button
												key={ent}
												className={`${styles.item} ${
													isSelf ? styles.itemSelf : ''
												}`}
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
													<WorldIcon
														size={12}
														className={styles.entityIcon}
													/>
												) : (
													<EntityIcon
														size={12}
														className={styles.entityIcon}
													/>
												)}
												<span className={styles.itemName}>
													{isWorldEntity
														? `World ${worldId}`
														: `Entity ${entityId}`}
												</span>
												{isSelf && (
													<span className={styles.selfBadge}>self</span>
												)}
											</button>
										);
									})
								)}
							</div>
						</>
					) : (
						// Trait picker
						<>
							<input
								ref={inputRef}
								type="text"
								className={styles.input}
								placeholder="Search traits..."
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
							/>
							<div className={styles.list}>
								{sortedTraits.length === 0 ? (
									<div className={styles.empty}>No traits match filter</div>
								) : (
									sortedTraits.map((trait) => {
										const type = getTraitType(trait);
										const isRelation = type === 'rel';
										// For relations, disable if trait already on entity
										// (they can still add with different targets)
										const isDisabled = !isRelation && currentTraitSet.has(trait);
										return (
											<button
												key={(trait as TraitWithDebug)[$internal]?.id}
												className={`${styles.item} ${
													isDisabled ? styles.itemDisabled : ''
												}`}
												onClick={() =>
													!isDisabled && handleTraitSelect(trait)
												}
												disabled={isDisabled}
											>
												<span
													className={`${badgeStyles.badge} ${badgeClasses[type]}`}
												>
													{type}
												</span>
												<span className={styles.itemName}>
													{getTraitName(trait)}
												</span>
												{isRelation && (
													<span className={styles.relationArrow}>→</span>
												)}
											</button>
										);
									})
								)}
							</div>
						</>
					)}
				</div>
			</div>
		</Panel.Portal>
	);
}

const badgeClasses: Record<string, string> = {
	tag: badgeStyles.badgeTag,
	soa: badgeStyles.badgeSoa,
	aos: badgeStyles.badgeAos,
	rel: badgeStyles.badgeRel,
};
