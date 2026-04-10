import type { SourceInfo } from '../../types';

type Editor = 'cursor' | 'vscode' | 'webstorm' | 'idea';

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

export function getShortPath(file: string): string {
	const srcIndex = file.indexOf('/src/');
	if (srcIndex !== -1) return file.slice(srcIndex + 1);
	return file.split('/').pop() ?? file;
}

export function formatDebugSource(source: SourceInfo): string {
	return `${getShortPath(source.file)}:${source.line}`;
}

export function formatDebugSourceTitle(source: SourceInfo): string {
	return `${source.file}:${source.line}`;
}
