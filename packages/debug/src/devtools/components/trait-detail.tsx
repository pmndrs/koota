import type { Entity, Trait, World } from '@koota/core';
import { $internal } from '@koota/core';
import { EntityRow } from './entity-row';
import { Fragment, useEffect, useState } from 'react';
import type { TraitWithDebug } from '../../types';
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
	tag: styles.detailBadgeTag,
	soa: styles.detailBadgeSoa,
	aos: styles.detailBadgeAos,
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
	onBack: () => void;
}

export function TraitDetail({ world, trait, editor, onBack }: TraitDetailProps) {
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
					<span className={styles.detailName}>{name}</span>
					{trait.debugSource && (
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
					)}
				</div>
				<span className={`${styles.detailBadge} ${badgeClasses[type]}`}>{type}</span>
			</div>

			<div className={styles.detailSection}>
				<div className={styles.detailLabel}>Info</div>
				<div className={styles.detailGrid}>
					<span className={styles.detailKey}>ID</span>
					<span className={styles.detailValue}>{ctx.id}</span>
					<span className={styles.detailKey}>Type</span>
					<span className={styles.detailValue}>{ctx.type}</span>
					<span className={styles.detailKey}>Is Tag</span>
					<span className={styles.detailValue}>{ctx.isTag ? 'yes' : 'no'}</span>
					<span className={styles.detailKey}>Is Pair</span>
					<span className={styles.detailValue}>{ctx.isPairTrait ? 'yes' : 'no'}</span>
				</div>
			</div>

			{schemaKeys.length > 0 && (
				<div className={styles.detailSection}>
					<div className={styles.detailLabel}>Schema</div>
					<div className={styles.detailGrid}>
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
					</div>
				</div>
			)}

			<div className={styles.detailSection}>
				<div className={styles.detailLabel}>
					Entities <span className={styles.detailCount}>{entities.length}</span>
				</div>
				<div className={styles.entityList}>
					{entities.length === 0 ? (
						<div className={styles.emptySmall}>No entities</div>
					) : (
						entities
							.slice(0, 50)
							.map((entity) => <EntityRow key={entity} entity={entity} />)
					)}
					{entities.length > 50 && (
						<span className={styles.moreEntities}>+{entities.length - 50} more</span>
					)}
				</div>
			</div>
		</div>
	);
}
