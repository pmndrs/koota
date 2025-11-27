import type { Entity, Trait, World } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import type { TraitWithDebug } from '../../types';
import styles from '../styles.module.css';
import { DetailGrid, DetailLayout, DetailSection } from './detail-layout';
import { Row, RowName } from './row';
import { getTraitName, getTraitType } from './trait-utils';

interface EntityDetailProps {
	world: World;
	entity: Entity;
	onBack: () => void;
	onSelectTrait: (trait: TraitWithDebug) => void;
}

export function EntityDetail({
	world,
	entity,
	onBack,
	onSelectTrait,
}: EntityDetailProps) {
	const { entityId, generation, worldId } = unpackEntity(entity);
	const ctx = world[$internal];
	const [traits, setTraits] = useState<Trait[]>(() => [
		...(ctx.entityTraits.get(entity) ?? []),
	]);

	useEffect(() => {
		const ctx = world[$internal];
		const update = () => {
			setTraits([...(ctx.entityTraits.get(entity) ?? [])]);
		};

		update();

		const unsubscribes: (() => void)[] = [];

		const subscribeTrait = (trait: Trait) => {
			unsubscribes.push(
				world.onAdd(trait, (ent) => {
					if (ent === entity) update();
				})
			);
			unsubscribes.push(
				world.onRemove(trait, (ent) => {
					if (ent === entity) update();
				})
			);
		};

		for (const trait of ctx.traitData.keys()) {
			subscribeTrait(trait);
		}

		const handleRegistered = (trait: Trait) => {
			subscribeTrait(trait);
		};

		ctx.traitRegisteredSubscriptions.add(handleRegistered);

		const handleDestroyed = (ent: Entity) => {
			if (ent === entity) update();
		};

		ctx.entityDestroyedSubscriptions.add(handleDestroyed);

		return () => {
			unsubscribes.forEach((unsub) => unsub());
			ctx.traitRegisteredSubscriptions.delete(handleRegistered);
			ctx.entityDestroyedSubscriptions.delete(handleDestroyed);
		};
	}, [entity, world]);

	const sortedTraits = useMemo(
		() =>
			[...traits]
				.map((trait) => trait as TraitWithDebug)
				.sort((a, b) => getTraitName(a).localeCompare(getTraitName(b))),
		[traits]
	);

	return (
		<DetailLayout
			title={`Entity ${entityId}`}
			subtitle={
				<div className={styles.entityMetaInline}>
					<span>gen:{generation}</span>
					<span>world:{worldId}</span>
					<span>{entity}</span>
				</div>
			}
			onBack={onBack}
		>
			<DetailSection label="Info">
				<DetailGrid>
					<span className={styles.detailKey}>ID</span>
					<span className={styles.detailValue}>{entityId}</span>
					<span className={styles.detailKey}>Generation</span>
					<span className={styles.detailValue}>{generation}</span>
					<span className={styles.detailKey}>World</span>
					<span className={styles.detailValue}>{worldId}</span>
					<span className={styles.detailKey}>Raw</span>
					<span className={styles.detailValue}>{entity}</span>
				</DetailGrid>
			</DetailSection>

			<DetailSection label="Traits" count={sortedTraits.length}>
				{sortedTraits.length === 0 ? (
					<div className={styles.emptySmall}>No traits on entity</div>
				) : (
					sortedTraits.map((trait) => {
						const type = getTraitType(trait);
						return (
							<Row
								key={trait[$internal].id}
								onClick={() => onSelectTrait(trait)}
								title={
									trait.debugSource
										? `${trait.debugSource.file}:${trait.debugSource.line}`
										: undefined
								}
							>
								<span className={`${styles.badge} ${badgeClasses[type]}`}>{type}</span>
								<RowName>{getTraitName(trait)}</RowName>
							</Row>
						);
					})
				)}
			</DetailSection>
		</DetailLayout>
	);
}

const badgeClasses: Record<string, string> = {
	tag: styles.badgeTag,
	soa: styles.badgeSoa,
	aos: styles.badgeAos,
	rel: styles.badgeRel,
};


