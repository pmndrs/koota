import type { Entity, Trait } from '@koota/core';
import { $internal } from '@koota/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TraitWithDebug } from '../../types';
import { useWorldTraits } from '../hooks/use-world-traits';
import { useWorld } from '../hooks/use-world';
import badgeStyles from './badge.module.css';
import styles from './trait-picker.module.css';
import { getTraitName, getTraitType } from './trait-utils';

interface TraitPickerProps {
	entity: Entity;
	currentTraits: Trait[];
	zoom?: number;
	onSelect: (trait: Trait) => void;
	onClose: () => void;
	anchorRef?: React.RefObject<HTMLElement>;
}

export function TraitPicker({
	entity: _entity,
	currentTraits,
	zoom: _zoom,
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

	// Filter out traits already on the entity
	const availableTraits = useMemo(() => {
		const currentTraitSet = new Set(currentTraits);
		return allTraits.filter((trait) => !currentTraitSet.has(trait));
	}, [allTraits, currentTraits]);

	// Filter by search term
	const filteredTraits = useMemo(() => {
		if (!filter) return availableTraits;
		const lowerFilter = filter.toLowerCase();
		return availableTraits.filter((trait) =>
			getTraitName(trait).toLowerCase().includes(lowerFilter)
		);
	}, [availableTraits, filter]);

	// Sort by name
	const sortedTraits = useMemo(
		() => [...filteredTraits].sort((a, b) => getTraitName(a).localeCompare(getTraitName(b))),
		[filteredTraits]
	);

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Handle backdrop click
	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === backdropRef.current) {
			handleClose();
		}
	};

	// Handle escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') handleClose();
		};

		document.addEventListener('keydown', handleEscape);
		return () => document.removeEventListener('keydown', handleEscape);
	}, []);

	const handleClose = () => {
		if (isAnimatingOut) return; // Prevent double-close
		setIsAnimatingOut(true);
		// Wait for animation to complete before actually closing
		setTimeout(() => {
			onClose();
		}, 450); // Match exit animation duration
	};

	const handleSelect = (trait: Trait) => {
		onSelect(trait);
		handleClose();
	};

	// Portal to the panel level to be on top of scrollable content
	const panel = document.querySelector('[data-koota-devtools-root] .panel');
	if (!panel) return null;

	return createPortal(
		<div
			ref={backdropRef}
			className={`${styles.backdrop} ${isAnimatingOut ? styles.backdropExit : ''}`}
			onClick={handleBackdropClick}
		>
			<div
				ref={containerRef}
				className={`${styles.sheet} ${isAnimatingOut ? styles.sheetExit : ''}`}
			>
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
						<div className={styles.empty}>
							{availableTraits.length === 0
								? 'All traits already added'
								: 'No traits match filter'}
						</div>
					) : (
						sortedTraits.map((trait) => {
							const type = getTraitType(trait);
							return (
								<button
									key={(trait as TraitWithDebug)[$internal]?.id}
									className={styles.item}
									onClick={() => handleSelect(trait)}
								>
									<span className={`${badgeStyles.badge} ${badgeClasses[type]}`}>
										{type}
									</span>
									<span className={styles.itemName}>{getTraitName(trait)}</span>
								</button>
							);
						})
					)}
				</div>
			</div>
		</div>,
		panel
	);
}

const badgeClasses: Record<string, string> = {
	tag: badgeStyles.badgeTag,
	soa: badgeStyles.badgeSoa,
	aos: badgeStyles.badgeAos,
	rel: badgeStyles.badgeRel,
};
