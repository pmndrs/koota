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
	zoom: number;
	onSelect: (trait: Trait) => void;
	onClose: () => void;
	anchorRef: React.RefObject<HTMLElement>;
}

export function TraitPicker({
	entity: _entity,
	currentTraits,
	zoom,
	onSelect,
	onClose,
	anchorRef,
}: TraitPickerProps) {
	const world = useWorld();
	const allTraits = useWorldTraits(world);
	const [filter, setFilter] = useState('');
	const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

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

	// Calculate position based on anchor element
	useEffect(() => {
		if (anchorRef.current) {
			const rect = anchorRef.current.getBoundingClientRect();
			const width = Math.max(220, rect.width);
			setPosition({
				top: rect.bottom + 2,
				left: rect.right - width, // Align right edge with button's right edge
				width,
			});
		}
	}, [anchorRef]);

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Handle click outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as Node;
			// Don't close if clicking the picker itself or the anchor button
			if (containerRef.current?.contains(target) || anchorRef.current?.contains(target)) {
				return;
			}
			onClose();
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [onClose, anchorRef]);

	// Handle escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};

		document.addEventListener('keydown', handleEscape);
		return () => document.removeEventListener('keydown', handleEscape);
	}, [onClose]);

	const handleSelect = (trait: Trait) => {
		onSelect(trait);
		onClose();
	};

	const root =
		anchorRef.current?.closest<HTMLElement>('[data-koota-devtools-root]') ?? document.body;

	return createPortal(
		<div
			ref={containerRef}
			className={styles.picker}
			style={{
				position: 'fixed',
				top: `${position.top}px`,
				left: `${position.left}px`,
				width: `${position.width}px`,
				transform: `scale(${zoom})`,
				transformOrigin: 'top right',
			}}
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
		</div>,
		root
	);
}

const badgeClasses: Record<string, string> = {
	tag: badgeStyles.badgeTag,
	soa: badgeStyles.badgeSoa,
	aos: badgeStyles.badgeAos,
	rel: badgeStyles.badgeRel,
};
