import { useState } from 'react';
import styles from './object-inspector.module.css';

interface ObjectInspectorProps {
	data: any;
	name?: string;
	depth?: number;
	defaultExpanded?: boolean;
}

export function ObjectInspector({
	data,
	name,
	depth = 0,
	defaultExpanded = false,
}: ObjectInspectorProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);

	const valueType = getValueType(data);
	const isExpandable = valueType === 'object' || valueType === 'array';
	const hasChildren = isExpandable && getChildCount(data) > 0;

	const handleToggle = () => {
		if (hasChildren) {
			setIsExpanded(!isExpanded);
		}
	};

	const renderValue = () => {
		if (data === null) return <span className={styles.valueNull}>null</span>;
		if (data === undefined) return <span className={styles.valueUndefined}>undefined</span>;

		switch (valueType) {
			case 'string':
				const truncatedString = data.length > 50 ? data.slice(0, 50) + '…' : data;
				return <span className={styles.valueString}>"{truncatedString}"</span>;
			case 'number':
				return <span className={styles.valueNumber}>{data}</span>;
			case 'boolean':
				return <span className={styles.valueBoolean}>{String(data)}</span>;
			case 'function':
				return <span className={styles.valueFunction}>ƒ {data.name || 'anonymous'}()</span>;
			case 'array':
				return (
					<span className={styles.valueArray}>
						Array({data.length})
						{!isExpanded && data.length > 0 && (
							<span className={styles.preview}> [{getArrayPreview(data)}]</span>
						)}
					</span>
				);
			case 'object':
				const keys = Object.keys(data);
				return (
					<span className={styles.valueObject}>
						{getObjectConstructorName(data)}
						{!isExpanded && keys.length > 0 && (
							<span className={styles.preview}> {`{${getObjectPreview(data)}}`}</span>
						)}
					</span>
				);
			default:
				const str = String(data);
				const truncated = str.length > 50 ? str.slice(0, 50) + '…' : str;
				return <span className={styles.valueDefault}>{truncated}</span>;
		}
	};

	return (
		<div className={styles.inspector} style={{ paddingLeft: depth > 0 ? '12px' : '0' }}>
			<div className={styles.row} onClick={handleToggle}>
				{hasChildren && (
					<span className={styles.arrow}>{isExpanded ? '▼' : '▶'}</span>
				)}
				{!hasChildren && isExpandable && <span className={styles.arrowPlaceholder} />}
				{name && <span className={styles.name}>{name}: </span>}
				{renderValue()}
			</div>

			{isExpanded && hasChildren && (
				<div className={styles.children}>
					{valueType === 'array'
						? data.map((item: any, index: number) => (
								<ObjectInspector
									key={index}
									data={item}
									name={String(index)}
									depth={depth + 1}
								/>
							))
						: Object.entries(data).map(([key, value]) => (
								<ObjectInspector
									key={key}
									data={value}
									name={key}
									depth={depth + 1}
								/>
							))}
				</div>
			)}
		</div>
	);
}

function getValueType(value: any): string {
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';
	if (Array.isArray(value)) return 'array';
	return typeof value;
}

function getChildCount(value: any): number {
	if (Array.isArray(value)) return value.length;
	if (typeof value === 'object' && value !== null) return Object.keys(value).length;
	return 0;
}

function getArrayPreview(arr: any[]): string {
	const maxLength = 60;
	const preview = arr.slice(0, 2).map((item) => {
		if (item === null) return 'null';
		if (item === undefined) return 'undefined';
		if (typeof item === 'string') {
			const truncated = item.length > 20 ? item.slice(0, 20) + '…' : item;
			return `"${truncated}"`;
		}
		if (typeof item === 'object') return Array.isArray(item) ? '[…]' : '{…}';
		const str = String(item);
		return str.length > 20 ? str.slice(0, 20) + '…' : str;
	});
	let result = preview.join(', ');
	if (arr.length > 2) result += ', …';
	return result.length > maxLength ? result.slice(0, maxLength) + '…' : result;
}

function getObjectPreview(obj: any): string {
	const maxLength = 60;
	const keys = Object.keys(obj).slice(0, 2);
	const preview = keys.map((key) => {
		const value = obj[key];
		let valueStr = '';
		if (value === null) valueStr = 'null';
		else if (value === undefined) valueStr = 'undefined';
		else if (typeof value === 'string') {
			const truncated = value.length > 15 ? value.slice(0, 15) + '…' : value;
			valueStr = `"${truncated}"`;
		}
		else if (typeof value === 'object') valueStr = Array.isArray(value) ? '[…]' : '{…}';
		else {
			const str = String(value);
			valueStr = str.length > 15 ? str.slice(0, 15) + '…' : str;
		}
		return `${key}: ${valueStr}`;
	});
	let result = preview.join(', ');
	if (Object.keys(obj).length > 2) result += ', …';
	return result.length > maxLength ? result.slice(0, maxLength) + '…' : result;
}

function getObjectConstructorName(obj: any): string {
	if (obj.constructor && obj.constructor.name && obj.constructor.name !== 'Object') {
		return obj.constructor.name;
	}
	return 'Object';
}

