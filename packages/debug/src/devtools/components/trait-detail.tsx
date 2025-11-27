import type { Entity, World } from '@koota/core';
import { $internal } from '@koota/core';
import type { RefObject } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { EntityList } from './entity-list';
import type { TraitWithDebug } from '../../types';
import styles from '../styles.module.css';
import { DetailGrid, DetailLayout, DetailSection } from './detail-layout';
import { getTraitName, getTraitType } from './trait-utils';

const badgeClasses: Record<string, string> = {
	tag: styles.detailBadgeTag,
	soa: styles.detailBadgeSoa,
	aos: styles.detailBadgeAos,
	rel: styles.detailBadgeRel,
};

type Editor = 'cursor' | 'vscode' | 'webstorm' | 'idea';

function getEditorUrl(editor: Editor, file: string, line: number, column: number): string {
	switch (editor) {
		case 'cursor':
			return `cursor://file/${file}:${line}:${column}`;
		case 'vscode':
			return `vscode://file/${file}:${line}:${column}`;
		case 'webstorm':
		case 'idea':
			return `jetbrains://${editor}/navigate/reference?file=${file}&line=${line}&column=${column}`;
	}
}

function getShortPath(file: string): string {
	const srcIndex = file.indexOf('/src/');
	if (srcIndex !== -1) return file.slice(srcIndex + 1);
	return file.split('/').pop() ?? file;
}

interface TraitDetailProps {
	world: World;
	trait: TraitWithDebug;
	editor: Editor;
	scrollRef: RefObject<HTMLDivElement | null>;
	onBack: () => void;
}

export function TraitDetail({ world, trait, editor, scrollRef, onBack }: TraitDetailProps) {
	const [entities, setEntities] = useState<Entity[]>([]);

	const ctx = trait[$internal];
	const name = getTraitName(trait);
	const type = getTraitType(trait);

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

	// Get schema keys
	const schemaKeys = ctx.isTag ? [] : Object.keys(trait.schema || {});

	return (
		<DetailLayout
			title={name}
			subtitle={
				trait.debugSource ? (
					<a
						href={getEditorUrl(
							editor,
							trait.debugSource.file,
							trait.debugSource.line,
							trait.debugSource.column
						)}
						className={styles.detailSource}
					>
						{getShortPath(trait.debugSource.file)}:{trait.debugSource.line}
					</a>
				) : undefined
			}
			badge={<span className={`${styles.detailBadge} ${badgeClasses[type]}`}>{type}</span>}
			onBack={onBack}
		>
			<DetailSection label="Info">
				<DetailGrid>
					<span className={styles.detailKey}>ID</span>
					<span className={styles.detailValue}>{ctx.id}</span>
					<span className={styles.detailKey}>Type</span>
					<span className={styles.detailValue}>{ctx.type}</span>
					<span className={styles.detailKey}>Is Tag</span>
					<span className={styles.detailValue}>{ctx.isTag ? 'yes' : 'no'}</span>
					<span className={styles.detailKey}>Is Pair</span>
					<span className={styles.detailValue}>{ctx.isPairTrait ? 'yes' : 'no'}</span>
				</DetailGrid>
			</DetailSection>

			{schemaKeys.length > 0 && (
				<DetailSection label="Schema">
					<DetailGrid>
						{schemaKeys.map((key) => (
							<Fragment key={key}>
								<span className={styles.detailKey}>{key}</span>
								<span className={styles.detailValue}>
									{typeof trait.schema[key] === 'function'
										? 'fn()'
										: String(trait.schema[key])}
								</span>
							</Fragment>
						))}
					</DetailGrid>
				</DetailSection>
			)}

			<DetailSection label="Entities" count={entities.length}>
				<EntityList entities={entities} scrollRef={scrollRef} />
			</DetailSection>
		</DetailLayout>
	);
}
