import type { Entity, Trait } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import type { TraitWithDebug } from '../../types';
import { useWorld } from '../hooks/use-world';
import badgeStyles from './badge.module.css';
import detailStyles from './detail-layout.module.css';
import entityDetailStyles from './entity-detail.module.css';
import rowStyles from './row.module.css';
import { formatDebugSourceTitle } from '../utils/debug-source';
import { hasDebugSource } from '../utils/type-guards';
import { DetailGrid, DetailLayout, DetailSection } from './detail-layout';
import { Row, RowName } from './row';
import { getTraitName, getTraitType } from './trait-utils';
import { TraitValueEditor } from './trait-value-editor';

interface EntityDetailProps {
	entity: Entity;
	onBack: () => void;
	onSelectTrait: (trait: TraitWithDebug) => void;
}

export function EntityDetail({ entity, onBack, onSelectTrait }: EntityDetailProps) {
	const world = useWorld();
	const { entityId, generation, worldId } = unpackEntity(entity);
	const ctx = world[$internal];
	const [traits, setTraits] = useState<Trait[]>(() => [...(ctx.entityTraits.get(entity) ?? [])]);
	const [expandedTraitId, setExpandedTraitId] = useState<number | null>(null);
	const isWorldEntity = entity === ctx.worldEntity;

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

		for (const data of ctx.traitData) {
			if (data) {
				subscribeTrait(data.trait);
			}
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
		() => [...traits].sort((a, b) => getTraitName(a).localeCompare(getTraitName(b))),
		[traits]
	);

	return (
		<DetailLayout
			title={
				<div className={entityDetailStyles.entityTitle}>
					{isWorldEntity ? `World ${worldId}` : `Entity ${entityId}`}
					{isWorldEntity && <span className={entityDetailStyles.worldBadge}>world</span>}
				</div>
			}
			subtitle={
				<div className={entityDetailStyles.entityMetaInline}>
					<span>gen:{generation}</span>
					<span>world:{worldId}</span>
					<span>{entity}</span>
				</div>
			}
			onBack={onBack}
		>
			<DetailSection label="Info">
				<DetailGrid>
					<span className={detailStyles.detailKey}>ID</span>
					<span className={detailStyles.detailValue}>{entityId}</span>
					<span className={detailStyles.detailKey}>Generation</span>
					<span className={detailStyles.detailValue}>{generation}</span>
					<span className={detailStyles.detailKey}>World</span>
					<span className={detailStyles.detailValue}>{worldId}</span>
					<span className={detailStyles.detailKey}>Raw</span>
					<span className={detailStyles.detailValue}>{entity}</span>
				</DetailGrid>
			</DetailSection>

			<DetailSection label="Traits" count={sortedTraits.length}>
				{sortedTraits.length === 0 ? (
					<div className={entityDetailStyles.emptySmall}>No traits on entity</div>
				) : (
					sortedTraits.map((trait) => {
						const type = getTraitType(trait);
						const traitCtx = trait[$internal];
						const relation = traitCtx.relation;
						const isRelation = relation !== null;
						const targets = isRelation ? entity.targetsFor(relation) : [];
						const traitId = traitCtx.id;
						const isExpanded = expandedTraitId === traitId;

						// Determine if trait can be expanded (has editable data)
						const isTag = traitCtx.isTag;
						const isAoS = traitCtx.type === 'aos';
						// For AoS, schema is a function, so check if there's actual data
						// For SoA, check if schema has keys
						const hasData = isAoS ? true : Object.keys(trait.schema || {}).length > 0;
						const canExpand = !isTag && hasData;

						return (
							<div key={traitId}>
								<div className={entityDetailStyles.traitRowContainer}>
									<Row
										onClick={
											canExpand
												? () =>
														setExpandedTraitId(
															isExpanded ? null : traitId
														)
												: undefined
										}
										title={
											hasDebugSource(trait)
												? formatDebugSourceTitle(trait.debugSource)
												: undefined
										}
									>
										<span
											className={`${badgeStyles.badge} ${badgeClasses[type]}`}
										>
											{type}
										</span>
										<RowName>
											{getTraitName(trait)}
											{isRelation && targets.length > 0 && (
												<span
													className={entityDetailStyles.relationTargetCount}
												>
													{' '}
													({targets.length} target
													{targets.length !== 1 ? 's' : ''})
												</span>
											)}
										</RowName>
										{canExpand && (
											<span className={entityDetailStyles.expandIcon}>
												{isExpanded ? '▼' : '▶'}
											</span>
										)}
									</Row>
									<button
										className={entityDetailStyles.infoButton}
										onClick={(e) => {
											e.stopPropagation();
											onSelectTrait(trait);
										}}
										title="View trait details"
									>
										ⓘ
									</button>
								</div>
								{isExpanded && canExpand && (
									<TraitValueEditor entity={entity} trait={trait} />
								)}
								{isRelation && targets.length > 0 && (
									<div className={entityDetailStyles.relationTargetsList}>
										{targets.map((target) => {
											const { entityId } = unpackEntity(target);
											return (
												<div
													key={target}
													className={`${rowStyles.row} ${entityDetailStyles.relationTargetRow}`}
												>
													<span
														className={
															entityDetailStyles.relationTargetArrow
														}
													>
														→
													</span>
													<RowName>Entity {entityId}</RowName>
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					})
				)}
			</DetailSection>
		</DetailLayout>
	);
}

const badgeClasses: Record<string, string> = {
	tag: badgeStyles.badgeTag,
	soa: badgeStyles.badgeSoa,
	aos: badgeStyles.badgeAos,
	rel: badgeStyles.badgeRel,
};
