import type { Trait, World } from '@koota/core';
import { $internal } from '@koota/core';
import type { TraitWithDebug } from '../../types';
import { useTraitEntityCount } from '../hooks/use-trait-entity-count';
import styles from '../styles.module.css';

function getTraitType(trait: Trait): 'tag' | 'soa' | 'aos' {
	const ctx = trait[$internal];
	if (ctx.isTag) return 'tag';
	return ctx.type;
}

function getTraitName(trait: TraitWithDebug): string {
	return trait.debugName ?? `Trait#${trait[$internal].id}`;
}

const badgeClasses = {
	tag: `${styles.badge} ${styles.badgeTag}`,
	soa: `${styles.badge} ${styles.badgeSoa}`,
	aos: `${styles.badge} ${styles.badgeAos}`,
};

interface TraitRowProps {
	world: World;
	trait: TraitWithDebug;
	onSelect: () => void;
}

export function TraitRow({ world, trait, onSelect }: TraitRowProps) {
	const entityCount = useTraitEntityCount(world, trait);

	const name = getTraitName(trait);
	const type = getTraitType(trait);

	return (
		<div
			className={`${styles.traitRow} ${styles.traitRowClickable}`}
			title={
				trait.debugSource ? `${trait.debugSource.file}:${trait.debugSource.line}` : undefined
			}
			onClick={onSelect}
		>
			<span className={badgeClasses[type]}>{type}</span>
			<span className={styles.traitName}>{name}</span>
			<span className={styles.count}>{entityCount}</span>
		</div>
	);
}
