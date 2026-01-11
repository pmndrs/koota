import type { Entity, Trait } from '@koota/core';
import { $internal } from '@koota/core';
import { useEffect, useState } from 'react';
import { useWorld } from '../hooks/use-world';
import { ObjectInspector } from './object-inspector';
import styles from './trait-value-editor.module.css';

interface TraitValueEditorProps {
	entity: Entity;
	trait: Trait;
}

export function TraitValueEditor({ entity, trait }: TraitValueEditorProps) {
	const world = useWorld();
	const traitCtx = trait[$internal];
	const [values, setValues] = useState<Record<string, any>>(() => entity.get(trait) || {});

	// Subscribe to changes for live updates
	useEffect(() => {
		const update = () => {
			const newValues = entity.get(trait);
			if (newValues) {
				setValues(newValues);
			}
		};

		const unsubChange = world.onChange(trait, (changedEntity) => {
			if (changedEntity === entity) {
				update();
			}
		});

		return unsubChange;
	}, [world, trait, entity]);

	// Tag traits have no data
	if (traitCtx.type === 'tag') {
		return <div className={styles.emptyMessage}>Tag trait (no data)</div>;
	}

	const isAoS = traitCtx.type === 'aos';

	// AoS returns non-primitive structures, display as expandable object
	if (isAoS) {
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
		const newValues = { ...values, [key]: value };
		setValues(newValues);
		entity.set(trait, newValues);
	};

	return (
		<div className={styles.editorGrid}>
			{schemaKeys.map((key) => {
				const currentValue = values[key];
				const valueType = typeof currentValue;

				return (
					<div key={key} className={styles.editorRow}>
						<label className={styles.editorKey}>{key}</label>
						<div className={styles.editorValue}>
							{renderInput(key, currentValue, valueType, handleChange)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function renderInput(
	key: string,
	value: any,
	valueType: string,
	onChange: (key: string, value: any) => void
) {
	switch (valueType) {
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
			// For complex types, show expandable inspector
			return <ObjectInspector data={value} />;
	}
}
