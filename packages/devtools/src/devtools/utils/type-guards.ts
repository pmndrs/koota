import type { Trait } from '@koota/core';
import type { SourceInfo, TraitWithDebug } from '../../types';

/**
 * Type guard to check if a trait has debug source information
 */
export function hasDebugSource(trait: Trait): trait is TraitWithDebug & { debugSource: SourceInfo } {
	return (
		'debugSource' in trait &&
		trait.debugSource !== undefined &&
		typeof trait.debugSource === 'object' &&
		trait.debugSource !== null &&
		'file' in trait.debugSource &&
		'line' in trait.debugSource &&
		'column' in trait.debugSource &&
		typeof trait.debugSource.file === 'string' &&
		typeof trait.debugSource.line === 'number' &&
		typeof trait.debugSource.column === 'number'
	);
}

/**
 * Type guard to check if a trait has debug name
 */
export function hasDebugName(trait: Trait): trait is TraitWithDebug {
	return 'debugName' in trait && typeof trait.debugName === 'string';
}

/**
 * Type guard to check if a value is a valid SourceInfo object
 */
export function isSourceInfo(value: unknown): value is SourceInfo {
	return (
		typeof value === 'object' &&
		value !== null &&
		'file' in value &&
		'line' in value &&
		'column' in value &&
		typeof (value as SourceInfo).file === 'string' &&
		typeof (value as SourceInfo).line === 'number' &&
		typeof (value as SourceInfo).column === 'number'
	);
}

