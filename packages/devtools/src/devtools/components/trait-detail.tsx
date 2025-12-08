import type { Entity } from '@koota/core';
import { $internal } from '@koota/core';
import type { Relation } from '@koota/core';
import type { RefObject } from 'react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { TraitWithDebug } from '../../types';
import { useWorld } from '../hooks/use-world';
import badgeStyles from './badge.module.css';
import detailStyles from './detail-layout.module.css';
import traitDetailStyles from './trait-detail.module.css';
import { formatDebugSource, getEditorUrl } from '../utils/debug-source';
import { DetailGrid, DetailLayout, DetailSection } from './detail-layout';
import { getTraitName, getTraitSource, getTraitType } from './trait-utils';
import { EntityList } from './entity-list';

const badgeClasses: Record<string, string> = {
	tag: badgeStyles.detailBadgeTag,
	soa: badgeStyles.detailBadgeSoa,
	aos: badgeStyles.detailBadgeAos,
	rel: badgeStyles.detailBadgeRel,
};

type Editor = 'cursor' | 'vscode' | 'webstorm' | 'idea';

interface TraitDetailProps {
	trait: TraitWithDebug;
	editor: Editor;
	scrollRef: RefObject<HTMLDivElement | null>;
	onBack: () => void;
	onSelectEntity: (entity: Entity) => void;
}

export function TraitDetail({
	trait,
	editor,
	scrollRef,
	onBack,
	onSelectEntity,
}: TraitDetailProps) {
	const world = useWorld();
	const [entities, setEntities] = useState<Entity[]>([]);

	const ctx = trait[$internal];
	const name = getTraitName(trait);
	const type = getTraitType(trait);
	const source = getTraitSource(trait);
	const isRelation = ctx.relation !== null;
	const relation = ctx.relation as Relation<any> | null;

	// Subscribe to entity changes for this trait
	useEffect(() => {
		const update = () => setEntities([...world.query(trait)]);
		update();

		const unsubAdd = world.onAdd(trait, update);
		const unsubRemove = world.onRemove(trait, update);

		return () => {
			unsubAdd();
			unsubRemove();
		};
	}, [world, trait]);

	// Get all unique targets for relation traits
	const targets = useMemo(() => {
		if (!isRelation || !relation) return [];
		const targetSet = new Set<Entity>();
		for (const entity of entities) {
			const entityTargets = entity.targetsFor(relation);
			for (const target of entityTargets) {
				targetSet.add(target);
			}
		}
		return Array.from(targetSet);
	}, [relation, entities, isRelation]);

	// Get schema keys
	const schemaKeys = ctx.isTag ? [] : Object.keys(trait.schema || {});

	return (
		<DetailLayout
			title={name}
			subtitle={
				source ? (
					<a
						href={getEditorUrl(
							editor,
							source.file,
							source.line,
							source.column
						)}
						className={traitDetailStyles.detailSource}
					>
						{formatDebugSource(source)}
					</a>
				) : undefined
			}
			badge={<span className={`${badgeStyles.detailBadge} ${badgeClasses[type]}`}>{type}</span>}
			onBack={onBack}
		>
			<DetailSection label={<span style={{ textTransform: 'uppercase' }}>Info</span>}>
				<DetailGrid>
					<span className={detailStyles.detailKey}>ID</span>
					<span className={detailStyles.detailValue}>{ctx.id}</span>
					<span className={detailStyles.detailKey}>Type</span>
					<span className={detailStyles.detailValue}>{ctx.type}</span>
					<span className={detailStyles.detailKey}>Is Tag</span>
					<span className={detailStyles.detailValue}>{ctx.isTag ? 'yes' : 'no'}</span>
					<span className={detailStyles.detailKey}>Is Relation</span>
					<span className={detailStyles.detailValue}>
						{ctx.relation !== null ? 'yes' : 'no'}
					</span>
				</DetailGrid>
			</DetailSection>

			{schemaKeys.length > 0 && (
				<DetailSection label={<span style={{ textTransform: 'uppercase' }}>Schema</span>}>
					<DetailGrid>
						{schemaKeys.map((key) => (
							<Fragment key={key}>
								<span className={detailStyles.detailKey}>{key}</span>
								<span className={detailStyles.detailValue}>
									{typeof trait.schema[key] === 'function'
										? 'fn()'
										: String(trait.schema[key])}
								</span>
							</Fragment>
						))}
					</DetailGrid>
				</DetailSection>
			)}

			{isRelation && (
				<DetailSection label={<span style={{ textTransform: 'uppercase' }}>Targets</span>} count={targets.length}>
					{targets.length === 0 ? (
						<div className={traitDetailStyles.emptySmall}>No targets</div>
					) : (
						<EntityList
							entities={targets}
							scrollRef={scrollRef}
							onSelect={onSelectEntity}
						/>
					)}
				</DetailSection>
			)}

			<DetailSection label={<span style={{ textTransform: 'uppercase' }}>Entities</span>} count={entities.length}>
				<EntityList entities={entities} scrollRef={scrollRef} onSelect={onSelectEntity} />
			</DetailSection>
		</DetailLayout>
	);
}
