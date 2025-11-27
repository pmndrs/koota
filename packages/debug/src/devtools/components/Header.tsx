import styles from '../styles.module.css';
import { EntityIcon, TraitIcon } from './icons';

export type Tab = 'traits' | 'entities';

interface HeaderProps {
	traitCount: number;
	entityCount: number;
	isOpen: boolean;
	isDragging: boolean;
	activeTab: Tab;
	onTabChange: (tab: Tab) => void;
	onToggle: () => void;
	onMouseDown: (e: React.MouseEvent) => void;
}

export function Header({
	traitCount,
	entityCount,
	isOpen,
	isDragging,
	activeTab,
	onTabChange,
	onToggle,
	onMouseDown,
}: HeaderProps) {
	return (
		<div className={isDragging ? styles.headerDragging : styles.header} onMouseDown={onMouseDown}>
			<div className={styles.headerLeft}>
				<span className={styles.title}>Koota</span>
				<div className={styles.tabs}>
					<button
						className={`${styles.tab} ${
							activeTab === 'entities' ? styles.tabActive : ''
						}`}
						onClick={() => onTabChange('entities')}
						onMouseDown={(e) => e.stopPropagation()}
						title="Entities"
					>
						<EntityIcon size={12} />
						<span>{entityCount}</span>
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'traits' ? styles.tabActive : ''}`}
						onClick={() => onTabChange('traits')}
						onMouseDown={(e) => e.stopPropagation()}
						title="Traits"
					>
						<TraitIcon size={12} />
						<span>{traitCount}</span>
					</button>
				</div>
			</div>
			<button
				className={styles.toggleButton}
				onClick={onToggle}
				onMouseDown={(e) => e.stopPropagation()}
				title={isOpen ? 'Collapse' : 'Expand'}
			>
				{isOpen ? '−' : '+'}
			</button>
		</div>
	);
}
