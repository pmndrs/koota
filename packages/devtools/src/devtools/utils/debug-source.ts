import type { SourceInfo } from '../../types';

type Editor = 'cursor' | 'vscode' | 'webstorm' | 'idea';

/**
 * Get editor URL for a source location
 */
export function getEditorUrl(
	editor: Editor,
	file: string,
	line: number,
	column: number
): string {
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

/**
 * Get short path from full file path
 * Returns path relative to /src/ if found, otherwise just the filename
 */
export function getShortPath(file: string): string {
	const srcIndex = file.indexOf('/src/');
	if (srcIndex !== -1) return file.slice(srcIndex + 1);
	return file.split('/').pop() ?? file;
}

/**
 * Format debug source as a string (file:line)
 */
export function formatDebugSource(source: SourceInfo): string {
	return `${getShortPath(source.file)}:${source.line}`;
}

/**
 * Format debug source for title attribute (full path:line)
 */
export function formatDebugSourceTitle(source: SourceInfo): string {
	return `${source.file}:${source.line}`;
}

