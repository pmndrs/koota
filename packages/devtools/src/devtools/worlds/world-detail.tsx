import type { Entity, World } from '@koota/core';
import { $internal } from '@koota/core';
import { DetailLayout, DetailSection } from '../shared/detail-layout';
import { WorldIcon } from '../shared/icons';
import styles from './world-detail.module.css';

interface WorldDetailProps {
	world: World;
	onNavigateEntities?: () => void;
	onNavigateTraits?: () => void;
	onNavigateRelations?: () => void;
	onSelectEntity?: (entity: Entity) => void;
}

function StatRow({
	label,
	value,
	onClick,
}: {
	label: string;
	value: React.ReactNode;
	onClick?: () => void;
}) {
	return (
		<div
			className={`${styles.statRow} ${onClick ? styles.statRowClickable : ''}`}
			onClick={onClick}
		>
			<span className={styles.statLabel}>{label}</span>
			<span className={styles.statValue}>{value}</span>
		</div>
	);
}

export function WorldDetail({
	world,
	onNavigateEntities,
	onNavigateTraits,
	onNavigateRelations,
	onSelectEntity,
}: WorldDetailProps) {
	const ctx = world[$internal];
	const entityIndex = ctx.entityIndex;

	const entityCount = entityIndex.aliveCount;
	const pageCount = entityIndex.ownedPages.length;
	const traitCount = ctx.traits.size;
	const relationCount = ctx.relations.size;
	const queryCount = ctx.queriesHashMap.size;
	const totalPageCapacity = pageCount * 1024;
	const utilization =
		totalPageCapacity > 0 ? Math.round((entityCount / totalPageCapacity) * 100) : 0;

	return (
		<DetailLayout
			title={
				<div className={styles.worldTitle}>
					<WorldIcon size={14} className={styles.icon} />
					World {world.id}
				</div>
			}
		>
			<DetailSection label={<span style={{ textTransform: 'uppercase' }}>Overview</span>}>
				<div className={styles.statsGrid}>
					<StatRow label="ID" value={world.id} />
					<StatRow
						label="Entities"
						value={entityCount}
						onClick={onNavigateEntities}
					/>
					<StatRow
						label="Traits"
						value={traitCount}
						onClick={onNavigateTraits}
					/>
					<StatRow
						label="Relations"
						value={relationCount}
						onClick={onNavigateRelations}
					/>
					<StatRow label="Queries" value={queryCount} />
				</div>
			</DetailSection>

			<DetailSection label={<span style={{ textTransform: 'uppercase' }}>Memory</span>}>
				<div className={styles.statsGrid}>
					<StatRow label="Pages owned" value={pageCount} />
					<StatRow label="Page capacity" value={`${totalPageCapacity} slots`} />
					<StatRow label="Utilization" value={`${utilization}%`} />
					<StatRow
						label="Page IDs"
						value={pageCount > 0 ? entityIndex.ownedPages.join(', ') : '—'}
					/>
				</div>
			</DetailSection>

			<DetailSection label={<span style={{ textTransform: 'uppercase' }}>Internals</span>}>
				<div className={styles.statsGrid}>
					<StatRow label="Bitflag cursor" value={ctx.bitflag} />
					<StatRow label="Tracked traits" value={ctx.trackedTraits.size} />
					<StatRow label="Dirty queries" value={ctx.dirtyQueries.size} />
					<StatRow
						label="World entity"
						value={String(ctx.worldEntity)}
						onClick={
							onSelectEntity && ctx.worldEntity != null
								? () => onSelectEntity(ctx.worldEntity)
								: undefined
						}
					/>
				</div>
			</DetailSection>
		</DetailLayout>
	);
}
