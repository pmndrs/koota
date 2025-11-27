import type { ReactNode } from 'react';
import styles from '../styles.module.css';

interface DetailLayoutProps {
	title: ReactNode;
	subtitle?: ReactNode;
	badge?: ReactNode;
	onBack: () => void;
	children: ReactNode;
}

export function DetailLayout({ title, subtitle, badge, onBack, children }: DetailLayoutProps) {
	return (
		<div className={styles.detailView}>
			<button className={styles.backButton} onClick={onBack}>
				<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
					<path
						fillRule="evenodd"
						d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
					/>
				</svg>
				Back
			</button>

			<div className={styles.detailHeader}>
				<div className={styles.detailTitle}>
					<span className={styles.detailName}>{title}</span>
					{subtitle}
				</div>
				{badge}
			</div>

			{children}
		</div>
	);
}

interface DetailSectionProps {
	label: ReactNode;
	count?: number;
	children: ReactNode;
}

export function DetailSection({ label, count, children }: DetailSectionProps) {
	return (
		<div className={styles.detailSection}>
			<div className={styles.detailLabel}>
				{label}
				{typeof count === 'number' && (
					<span className={styles.detailCount}>{count}</span>
				)}
			</div>
			{children}
		</div>
	);
}

interface DetailGridProps {
	children: ReactNode;
}

export function DetailGrid({ children }: DetailGridProps) {
	return <div className={styles.detailGrid}>{children}</div>;
}


