import { useCallback } from 'react';
import { Button } from './button';
import styles from './header.module.css';
import { EntityIcon, GraphIcon, TraitIcon } from './icons';
import { usePanel } from './panel';

export type Tab = 'traits' | 'entities' | 'graph';

interface HeaderProps {
	traitCount: number;
	entityCount: number;
	relationCount: number;
	activeTab: Tab;
	canGoBack: boolean;
	onTabChange: (tab: Tab) => void;
	onBack: () => void;
}

export function Header({
	traitCount,
	entityCount,
	relationCount,
	activeTab,
	canGoBack,
	onTabChange,
	onBack,
}: HeaderProps) {
	const { isOpen, setIsOpen } = usePanel();
	const toggle = useCallback(() => setIsOpen((prev) => !prev), [setIsOpen]);

	return (
		<>
			{/* <button
				className={styles.backButton}
				data-visible={canGoBack}
				onClick={onBack}
				onMouseDown={(e) => e.stopPropagation()}
				title="Go back"
			>
				<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
					<path
						fillRule="evenodd"
						d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
					/>
				</svg>
			</button> */}

			<span className={styles.title}>Koota</span>

			<div className={styles.headerLeft}>
				<div className={styles.headerContent}>
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
							className={`${styles.tab} ${
								activeTab === 'traits' ? styles.tabActive : ''
							}`}
							onClick={() => onTabChange('traits')}
							onMouseDown={(e) => e.stopPropagation()}
							title="Traits"
						>
							<TraitIcon size={12} />
							<span>{traitCount}</span>
						</button>
						<button
							className={`${styles.tab} ${
								activeTab === 'graph' ? styles.tabActive : ''
							}`}
							onClick={() => onTabChange('graph')}
							onMouseDown={(e) => e.stopPropagation()}
							title="Relation Graph"
						>
							<GraphIcon size={12} />
							<span>{relationCount}</span>
						</button>
					</div>
				</div>
			</div>
			<Button
				onClick={toggle}
				onMouseDown={(e) => e.stopPropagation()}
				title={isOpen ? 'Collapse' : 'Expand'}
			>
				{isOpen ? '−' : '+'}
			</Button>
		</>
	);
}
