import type { Editor, SourceInfo } from '../../types';

export function getEditorUrl(editor: Editor, source: SourceInfo): string {
  const { file, line, column } = source;

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
 * Paths are shown relative to the nearest src folder so they stay short,
 * falling back to the file name when there is no src folder.
 */
export function formatSource(source: SourceInfo): string {
  const index = source.file.indexOf('/src/');
  const path =
    index === -1 ? (source.file.split('/').pop() ?? source.file) : source.file.slice(index + 1);
  return `${path}:${source.line}`;
}

export function formatSourceTitle(source: SourceInfo): string {
  return `${source.file}:${source.line}`;
}
