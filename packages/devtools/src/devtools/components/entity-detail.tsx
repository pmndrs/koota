import type { Entity, Trait } from '@koota/core';
import { $internal, unpackEntity } from '@koota/core';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { TraitPicker } from './trait-picker';

interface EntityDetailProps {
	entity: Entity;
	zoom: number;
	onBack: () => void;
	onSelectTrait: (trait: TraitWithDebug) => void;
}

export function EntityDetail({ entity, zoom, onBack, onSelectTrait }: EntityDetailProps) {
	const world = useWorld();
	const { entityId, generation, worldId } = unpackEntity(entity);
	const ctx = world[$internal];
	const [traits, setTraits] = useState<Trait[]>(() => [...(ctx.entityTraits.get(entity) ?? [])]);
	const [expandedTraitId, setExpandedTraitId] = useState<number | null>(null);
	const [showTraitPicker, setShowTraitPicker] = useState(false);
	const addButtonRef = useRef<HTMLButtonElement>(null);
	const isWorldEntity = entity === ctx.worldEntity;

	useEffect(() => {
		const ctx = world[$internal];

		// Initial sync in case entity changed
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
			if (ent === entity) {
				setTraits([]);
			}
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

	const handleAddTrait = (trait: Trait) => {
		entity.add(trait);
	};

	const handleRemoveTrait = (trait: Trait) => {
		entity.remove(trait);
	};

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
					<span>id:{entityId}</span>
					<span>gen:{generation}</span>
					<span>world:{worldId}</span>

					<span
						style={{ position: 'absolute', right: 0, top: 0, color: 'var(--k-text-dim)' }}
					>
						{entity}
					</span>
				</div>
			}
			onBack={onBack}
		>
			<DetailSection
				label={
					<div className={entityDetailStyles.sectionHeader}>
						<span>
							Traits{' '}
							<span className={detailStyles.detailCount}>{sortedTraits.length}</span>
						</span>
						<button
							ref={addButtonRef}
							className={entityDetailStyles.addButton}
							onClick={() => setShowTraitPicker((prev) => !prev)}
							title="Add trait"
						>
							+ Add
						</button>
					</div>
				}
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
											onBack();
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
					zoom={zoom}
					onSelect={handleAddTrait}
					onClose={() => setShowTraitPicker(false)}
					anchorRef={addButtonRef as React.RefObject<HTMLElement>}
				/>
			)}
		</DetailLayout>
	);
}

const badgeClasses: Record<string, string> = {
	tag: badgeStyles.badgeTag,
	soa: badgeStyles.badgeSoa,
	aos: badgeStyles.badgeAos,
	rel: badgeStyles.badgeRel,
};
