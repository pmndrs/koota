import type { Entity, Trait } from '@koota/core';
import { $internal } from '@koota/core';
import { useEffect, useState } from 'react';
import { useWorld } from '../hooks/use-world';
import { ObjectInspector } from '../shared/object-inspector';
import styles from './trait-value-editor.module.css';

interface TraitValueEditorProps {
	entity: Entity;
	trait: Trait;
}

export function TraitValueEditor({ entity, trait }: TraitValueEditorProps) {
	const world = useWorld();
	const traitCtx = trait[$internal];
	const [values, setValues] = useState<Record<string, any>>(() => entity.get(trait) || {});

	useEffect(() => {
		return world.onChange(trait, (changedEntity) => {
			if (changedEntity === entity) {
				const next = entity.get(trait);
				if (next) setValues(next);
			}
		});
	}, [world, trait, entity]);

	if (traitCtx.type === 'tag') {
		return <div className={styles.emptyMessage}>Tag trait (no data)</div>;
	}

	if (traitCtx.type === 'aos') {
		return (
			<div className={styles.aosData}>
				<ObjectInspector data={values} />
			</div>
		);
	}

	const schemaKeys = Object.keys(trait.schema || {});

	if (schemaKeys.length === 0) {
		return <div className={styles.emptyMessage}>No data</div>;
	}

	const handleChange = (key: string, value: any) => {
		const next = { ...values, [key]: value };
		setValues(next);
		entity.set(trait, next);
	};

	return (
		<div className={styles.editorGrid}>
			{schemaKeys.map((key) => {
				const value = values[key];
				const isExpandable = value != null && typeof value === 'object';

				return (
					<div key={key} className={styles.editorRow}>
						<label className={styles.editorKey}>{key}</label>
						<div
							className={`${styles.editorValue} ${
								isExpandable ? styles.editorValueExpanded : ''
							}`}
						>
							{renderInput(key, value, handleChange)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function renderInput(key: string, value: any, onChange: (key: string, value: any) => void) {
	switch (typeof value) {
		case 'number':
			return (
				<input
					type="number"
					value={value ?? 0}
					onChange={(e) => onChange(key, parseFloat(e.target.value) || 0)}
					onClick={(e) => e.currentTarget.select()}
					className={styles.input}
				/>
			);

		case 'string':
			return (
				<input
					type="text"
					value={value ?? ''}
					onChange={(e) => onChange(key, e.target.value)}
					onClick={(e) => e.currentTarget.select()}
					className={styles.input}
				/>
			);

		case 'boolean':
			return (
				<input
					type="checkbox"
					checked={value ?? false}
					onChange={(e) => onChange(key, e.target.checked)}
					className={styles.checkbox}
				/>
			);

		default:
			return (
				<div className={styles.inspectorValue}>
					<ObjectInspector data={value} />
				</div>
			);
	}
}
