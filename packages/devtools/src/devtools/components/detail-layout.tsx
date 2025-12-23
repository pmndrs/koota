import type { ReactNode } from 'react';
import styles from './detail-layout.module.css';

interface DetailLayoutProps {
	title: ReactNode;
	subtitle?: ReactNode;
	badge?: ReactNode;
	children: ReactNode;
}

export function DetailLayout({ title, subtitle, badge, children }: DetailLayoutProps) {
	return (
		<div className={styles.detailView}>
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
				{typeof count === 'number' && <span className={styles.detailCount}>{count}</span>}
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
