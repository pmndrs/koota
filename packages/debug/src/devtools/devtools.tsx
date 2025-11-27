import { $internal, type Trait, type World } from '@koota/core';
import { useRef, useState } from 'react';
import type { TraitWithDebug } from '../types';
import { AllEntitiesList } from './components/all-entities-list';
import { Header, type Tab } from './components/header';
import { TraitDetail } from './components/trait-detail';
import { TraitList } from './components/trait-list';
import { useDraggable } from './hooks/use-draggable';
import { useEntityCount } from './hooks/use-entity-count';
import { useWorldTraits } from './hooks/use-world-traits';
import styles from './styles.module.css';

export type Editor = 'cursor' | 'vscode' | 'webstorm' | 'idea';

export interface DevtoolsProps {
	world: World;
	defaultPosition?: { x: number; y: number };
	defaultOpen?: boolean;
	editor?: Editor;
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
	editor = 'cursor',
}: DevtoolsProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);
	const [activeTab, setActiveTab] = useState<Tab>('traits');
	const [filter, setFilter] = useState('');
	const [showFilters, setShowFilters] = useState(false);
	const [typeFilters, setTypeFilters] = useState({
		tag: true,
		soa: true,
		aos: true,
	});
	const [selectedTrait, setSelectedTrait] = useState<TraitWithDebug | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const { position, isDragging, handleMouseDown } = useDraggable(defaultPosition);
	const traits = useWorldTraits(world);
	const entityCount = useEntityCount(world);

	const toggleType = (type: 'tag' | 'soa' | 'aos') => {
		setTypeFilters((prev) => ({ ...prev, [type]: !prev[type] }));
	};

	const handleTabChange = (tab: Tab) => {
		setActiveTab(tab);
		setSelectedTrait(null);
		setFilter('');
		setShowFilters(false);
	};

	const activeFilterCount = Object.values(typeFilters).filter((v) => !v).length;

	// Check if selected trait still exists
	const validSelectedTrait =
		selectedTrait && traits.includes(selectedTrait as Trait) ? selectedTrait : null;

	return (
		<div className={styles.container} style={{ top: position.y, left: position.x }}>
			<div className={styles.panel}>
				<Header
					traitCount={traits.length}
					entityCount={entityCount}
					isOpen={isOpen}
					isDragging={isDragging}
					activeTab={activeTab}
					onTabChange={handleTabChange}
					onToggle={() => setIsOpen(!isOpen)}
					onMouseDown={handleMouseDown}
				/>
				{isOpen && (
					<div ref={scrollRef} className={styles.list}>
						{activeTab === 'entities' ? (
							<AllEntitiesList world={world} />
						) : validSelectedTrait ? (
							<TraitDetail
								key={validSelectedTrait[$internal].id}
								world={world}
								trait={validSelectedTrait}
								editor={editor}
								scrollRef={scrollRef}
								onBack={() => setSelectedTrait(null)}
							/>
						) : (
							<>
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
										<svg
											width="12"
											height="12"
											viewBox="0 0 16 16"
											fill="currentColor"
										>
											<path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z" />
										</svg>
										{activeFilterCount > 0 && (
											<span className={styles.filterBadge}>
												{activeFilterCount}
											</span>
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
									onSelect={(trait) => setSelectedTrait(() => trait)}
								/>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
