import { Trait } from '@koota/core';

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
