import styles from '../styles.module.css';
import { EntityIcon, TraitIcon } from './icons';

interface HeaderProps {
	traitCount: number;
	entityCount: number;
	isOpen: boolean;
	isDragging: boolean;
	onToggle: () => void;
	onMouseDown: (e: React.MouseEvent) => void;
}

export function Header({
	traitCount,
	entityCount,
	isOpen,
	isDragging,
	onToggle,
	onMouseDown,
}: HeaderProps) {
	return (
		<div className={isDragging ? styles.headerDragging : styles.header} onMouseDown={onMouseDown}>
			<span className={styles.title}>Koota</span>
			<div className={styles.headerRight}>
				<div className={styles.stats}>
					<span className={styles.stat}>
						<EntityIcon size={10} className={styles.statIcon} />
						{entityCount}
					</span>
					<span className={styles.stat}>
						<TraitIcon size={10} className={styles.statIcon} />
						{traitCount}
					</span>
				</div>
				<button
					className={styles.toggleButton}
					onClick={onToggle}
					title={isOpen ? 'Collapse' : 'Expand'}
				>
					{isOpen ? '−' : '+'}
				</button>
			</div>
		</div>
	);
}
