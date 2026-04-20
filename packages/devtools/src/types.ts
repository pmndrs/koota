import { Trait } from '@koota/core';

export type Editor = 'cursor' | 'vscode' | 'webstorm' | 'idea';

export interface SourceInfo {
	file: string;
	line: number;
	column: number;
}

interface TraitDebugInfo {
	debugName?: string;
	debugSource?: SourceInfo;
}

export type TraitWithDebug = Trait & TraitDebugInfo;
