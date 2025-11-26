import type { World } from '@koota/core';
import { useState } from 'react';
import { Header } from './components/header';
import { TraitList } from './components/trait-list';
import { useDraggable } from './hooks/use-draggable';
import { useEntityCount } from './hooks/use-entity-count';
import { useWorldTraits } from './hooks/use-world-traits';
import styles from './styles.module.css';

export interface DevtoolsProps {
	world: World;
	defaultPosition?: { x: number; y: number };
	defaultOpen?: boolean;
}

const typeClasses = {
	tag: styles.typeBtnTag,
	soa: styles.typeBtnSoa,
	aos: styles.typeBtnAos,
};

export function Devtools({
	world,
	defaultPosition = { x: 16, y: 16 },
	defaultOpen = true,
}: DevtoolsProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	const [filter, setFilter] = useState('');
	const [showFilters, setShowFilters] = useState(false);
	const [typeFilters, setTypeFilters] = useState({
		tag: true,
		soa: true,
		aos: true,
	});
	const { position, isDragging, handleMouseDown } = useDraggable(defaultPosition);
	const traits = useWorldTraits(world);
	const entityCount = useEntityCount(world);

	const toggleType = (type: 'tag' | 'soa' | 'aos') => {
		setTypeFilters((prev) => ({ ...prev, [type]: !prev[type] }));
	};

	const activeFilterCount = Object.values(typeFilters).filter((v) => !v).length;

	return (
		<div className={styles.container} style={{ top: position.y, left: position.x }}>
			<div className={styles.panel}>
				<Header
					traitCount={traits.length}
					entityCount={entityCount}
					isOpen={isOpen}
					isDragging={isDragging}
					onToggle={() => setIsOpen(!isOpen)}
					onMouseDown={handleMouseDown}
				/>
				{isOpen && (
					<div className={styles.list}>
						<div className={styles.filterRow}>
							<input
								type="text"
								placeholder="Filter…"
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
								className={styles.filterInput}
							/>
							<button
								className={`${styles.filterToggle} ${
									showFilters ? styles.filterToggleActive : ''
								}`}
								onClick={() => setShowFilters(!showFilters)}
								title="Filter by type"
							>
								<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
									<path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z" />
								</svg>
								{activeFilterCount > 0 && (
									<span className={styles.filterBadge}>{activeFilterCount}</span>
								)}
							</button>
						</div>
						{showFilters && (
							<div className={styles.filterTypes}>
								{(['tag', 'soa', 'aos'] as const).map((type) => (
									<button
										key={type}
										className={`${styles.typeBtn} ${typeClasses[type]} ${
											typeFilters[type] ? styles.typeBtnActive : ''
										}`}
										onClick={() => toggleType(type)}
									>
										{type}
									</button>
								))}
							</div>
						)}
						<TraitList
							world={world}
							traits={traits}
							filter={filter}
							typeFilters={typeFilters}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
