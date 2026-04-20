import type { Entity, Trait } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import { useEffect, useMemo, useState } from 'react';
import type { TraitWithDebug } from '../../types';
import { useWorld } from '../hooks/use-world';
import badgeStyles from '../shared/badge.module.css';
import detailStyles from '../shared/detail-layout.module.css';
import entityDetailStyles from './entity-detail.module.css';
import rowStyles from '../shared/row.module.css';
import { formatDebugSourceTitle } from '../utils/debug-source';
import { hasDebugSource } from '../utils/type-guards';
import { DetailLayout, DetailSection } from '../shared/detail-layout';
import { Row, RowName } from '../shared/row';
import { getTraitName, getTraitType } from '../shared/trait-utils';
import { TraitValueEditor } from '../traits/trait-value-editor';
import { TraitPicker, type TraitPickerResult } from '../traits/trait-picker';
import { EntityIcon, WorldIcon } from '../shared/icons';

const badgeClasses: Record<string, string> = {
	tag: badgeStyles.badgeTag,
	soa: badgeStyles.badgeSoa,
	aos: badgeStyles.badgeAos,
	rel: badgeStyles.badgeRel,
};

interface EntityDetailProps {
	entity: Entity;
	onSelectTrait: (trait: TraitWithDebug) => void;
}

function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className={entityDetailStyles.metadataRow}>
			<span className={entityDetailStyles.metadataLabel}>{label}</span>
			<span className={entityDetailStyles.metadataValue}>{value}</span>
		</div>
	);
}

function EntityMetadata({
	entityId,
	generation,
	rawEntity,
}: {
	entityId: number;
	generation: number;
	rawEntity: Entity;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className={detailStyles.detailSection}>
			<div
				className={`${detailStyles.detailLabel} ${entityDetailStyles.metadataToggleLabel}`}
				onClick={() => setExpanded(!expanded)}
			>
				<span>METADATA</span>
				<span className={entityDetailStyles.metadataToggle}>{expanded ? '▼' : '▶'}</span>
				{!expanded && (
					<div className={entityDetailStyles.metadataSummary}>
						id:{entityId} gen:{generation}
					</div>
				)}
			</div>
			{expanded && (
				<div className={entityDetailStyles.metadataContent}>
				<MetadataRow label="ID" value={entityId} />
				<MetadataRow label="Generation" value={generation} />
				<MetadataRow label="Raw" value={String(rawEntity)} />
				</div>
			)}
		</div>
	);
}

export function EntityDetail({ entity, onSelectTrait }: EntityDetailProps) {
	const world = useWorld();
	const { entityId, generation } = unpackEntity(entity);
	const ctx = world[$internal];
	const [traits, setTraits] = useState<Trait[]>(() => [...(ctx.entityTraits.get(entity) ?? [])]);
	const [expandedTraitId, setExpandedTraitId] = useState<number | null>(null);
	const [showTraitPicker, setShowTraitPicker] = useState(false);
	const isWorldEntity = entity === ctx.worldEntity;

	useEffect(() => {
		const ctx = world[$internal];
		setTraits([...(ctx.entityTraits.get(entity) ?? [])]);

		const unsubscribes: (() => void)[] = [];

		const subscribeTrait = (trait: Trait) => {
			unsubscribes.push(
				world.onAdd(trait, (ent) => {
					if (ent === entity) {
						setTraits((prev) => (prev.includes(trait) ? prev : [...prev, trait]));
					}
				})
			);
			unsubscribes.push(
				world.onRemove(trait, (ent) => {
					if (ent === entity) {
						setTraits((prev) => prev.filter((t) => t !== trait));
					}
				})
			);
		};

		for (const data of ctx.traitInstances) {
			if (data) {
				subscribeTrait(data.trait);
			}
		}

		const unsubRegistered = world.onTraitRegistered((trait) => {
			subscribeTrait(trait);
		});

		const unsubDestroy = world.onEntityDestroy((ent) => {
			if (ent === entity) {
				setTraits([]);
			}
		});

		return () => {
			unsubscribes.forEach((unsub) => unsub());
			unsubRegistered();
			unsubDestroy();
		};
	}, [entity, world]);

	const sortedTraits = useMemo(
		() => [...traits].sort((a, b) => getTraitName(a).localeCompare(getTraitName(b))),
		[traits]
	);

	const handleAddTrait = (result: TraitPickerResult) => {
		if (result.type === 'trait') {
			entity.add(result.trait);
		} else {
			entity.add(result.relation(result.target));
		}
	};

	const handleRemoveTrait = (trait: Trait) => {
		entity.remove(trait);
	};

	return (
		<DetailLayout
			title={
				<div className={entityDetailStyles.entityTitle}>
					{isWorldEntity ? (
						<WorldIcon size={14} className={entityDetailStyles.icon} />
					) : (
						<EntityIcon size={14} className={entityDetailStyles.icon} />
					)}
					{isWorldEntity ? 'World' : `Entity ${entityId}`}
				</div>
			}
			badge={
				<button
					className={entityDetailStyles.addTraitButton}
					onClick={() => setShowTraitPicker((prev) => !prev)}
					title="Add trait to entity"
				>
					+ Add
				</button>
			}
		>
			<EntityMetadata
				entityId={entityId}
				generation={generation}
				rawEntity={entity}
			/>

			<DetailSection
				label={<span style={{ textTransform: 'uppercase' }}>Traits</span>}
				count={sortedTraits.length}
			>
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

						const isTag = traitCtx.type === 'tag';
						const isAoS = traitCtx.type === 'aos';
						const hasData = isAoS ? true : Object.keys(trait.schema || {}).length > 0;
						const canExpand = !isTag && hasData;

						return (
							<div key={traitId}>
								<div className={entityDetailStyles.traitRowContainer}>
									<Row
										noHover
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
										className={entityDetailStyles.removeButton}
										onClick={(e) => {
											e.stopPropagation();
											handleRemoveTrait(trait);
										}}
										title="Remove trait"
									>
										×
									</button>
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
			{showTraitPicker && (
				<TraitPicker
					entity={entity}
					currentTraits={traits}
					onSelect={handleAddTrait}
					onClose={() => setShowTraitPicker(false)}
				/>
			)}
		</DetailLayout>
	);
}
