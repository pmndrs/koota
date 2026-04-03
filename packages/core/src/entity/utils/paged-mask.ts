import { MAX_PAGES, PAGE_SIZE } from './pack-entity';

/** Shared sentinel for unallocated mask pages. Always reads as 0. Never write to it directly. */
export const EMPTY_MASK_PAGE: Uint32Array = new Uint32Array(PAGE_SIZE);

/** Create a new mask generation array pre-filled with sentinels. */
export function createEmptyMaskGeneration(): Uint32Array[] {
	const gen = new Array<Uint32Array>(MAX_PAGES);
	gen.fill(EMPTY_MASK_PAGE);
	return gen;
}

/** Materialize a mask page on first write. Returns the writable page. */
export function ensureMaskPage(gen: Uint32Array[], pageId: number): Uint32Array {
	let page = gen[pageId];
	if (page === EMPTY_MASK_PAGE) {
		page = new Uint32Array(PAGE_SIZE);
		gen[pageId] = page;
	}
	return page;
}

/** Deep-clone a paged mask array, preserving sentinel references for untouched pages. */
export function cloneMaskGenerations(src: Uint32Array[][]): Uint32Array[][] {
	const dst = new Array<Uint32Array[]>(src.length);
	for (let g = 0; g < src.length; g++) {
		const srcGen = src[g];
		const dstGen = new Array<Uint32Array>(srcGen.length);
		for (let p = 0; p < srcGen.length; p++) {
			const page = srcGen[p];
			dstGen[p] = page === EMPTY_MASK_PAGE ? EMPTY_MASK_PAGE : page.slice();
		}
		dst[g] = dstGen;
	}
	return dst;
}

/** Create a zeroed paged mask array matching the shape of src. */
export function createZeroedMaskLike(src: Uint32Array[][]): Uint32Array[][] {
	const dst = new Array<Uint32Array[]>(src.length);
	for (let g = 0; g < src.length; g++) {
		dst[g] = createEmptyMaskGeneration();
	}
	return dst;
}
