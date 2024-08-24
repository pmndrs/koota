import { SparseSet } from 'koota/utils';
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useTransition } from 'react';
import { jsx } from 'react/jsx-runtime';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class Spawner {
	#pointer = 0;
	#sparseSet = new SparseSet();
	#pendingSpawns = new SparseSet();
	#pendingDestroys = new SparseSet();
	#recycleBin: number[] = [];
	#chunks: (React.ReactNode | null)[][] = [];
	#onChunkUpdateCbs: (() => void)[] = [];
	#onChunkAdd = () => {};
	#chunkSize = 250;
	#dirtyChunks = new Set<number>();

	#generations: number[] = [];
	#maxGeneration = (1 << 12) - 1; // Use 12 bits for generation (4096 generations)
	#maxId = (1 << 20) - 1; // Use 20 bits for ID (1,048,575 unique IDs)

	component: React.FunctionComponent<any>;
	elements: React.ReactNode[] = []; // Fill with Chunks

	get sids(): readonly number[] {
		return this.#sparseSet.dense;
	}

	constructor(component: React.FunctionComponent<any>) {
		this.component = component;
	}

	Emitter = createEmitter(this);

	spawn(): number {
		let id: number;
		if (this.#recycleBin.length) {
			id = this.#recycleBin.pop()!;
			this.#generations[id] = (this.#generations[id] + 1) & this.#maxGeneration;
		} else {
			id = this.#pointer++;
			if (id > this.#maxId) throw new Error('Maximum number of unique IDs reached');
			this.#generations[id] = 0;
		}

		const sid = this.#combineIdAndGeneration(id, this.#generations[id]);

		this.#sparseSet.add(sid);
		this.#addToChunk(sid);

		const chunkId = Math.floor(id / this.#chunkSize);
		this.#onChunkUpdateCbs[chunkId]();

		return sid;
	}

	destroy(sid: number) {
		const id = this.extractId(sid);
		this.#sparseSet.remove(sid);
		this.#removeFromChunk(sid);
		this.#recycleBin.push(id);

		const chunkId = Math.floor(id / this.#chunkSize);
		this.#onChunkUpdateCbs[chunkId]();
	}

	queueSpawn(): number {
		let id: number;
		if (this.#recycleBin.length) {
			id = this.#recycleBin.pop()!;
			this.#generations[id] = (this.#generations[id] + 1) & this.#maxGeneration;
		} else {
			id = this.#pointer++;
			if (id > this.#maxId) throw new Error('Maximum number of unique IDs reached');
			this.#generations[id] = 0;
		}

		const sid = this.#combineIdAndGeneration(id, this.#generations[id]);

		this.#pendingSpawns.add(sid);

		return sid;
	}

	queueDestroy(sid: number): void {
		const id = this.extractId(sid);
		if (this.#sparseSet.has(sid) && !this.#pendingDestroys.has(sid)) {
			this.#pendingDestroys.add(sid);
			this.#recycleBin.push(id);
			// Remove from spawn queue.
		} else if (this.#pendingSpawns.has(sid)) {
			this.#pendingSpawns.remove(sid);
			this.#recycleBin.push(id);
		}
	}

	processQueue(): void {
		// Process destroys first
		for (const sid of this.#pendingDestroys.dense) {
			this.#sparseSet.remove(sid);
			this.#removeFromChunk(sid);

			const id = this.extractId(sid);
			const chunkId = Math.floor(id / this.#chunkSize);
			this.#dirtyChunks.add(chunkId);
		}

		// Process spawns
		for (const sid of this.#pendingSpawns.dense) {
			this.#sparseSet.add(sid);
			this.#addToChunk(sid);

			const id = this.extractId(sid);
			const chunkId = Math.floor(id / this.#chunkSize);
			this.#dirtyChunks.add(chunkId);
		}

		// Clear pending operations
		this.#pendingSpawns.clear();
		this.#pendingDestroys.clear();

		// Trigger updates
		for (const chunkId of this.#dirtyChunks) {
			this.#onChunkUpdateCbs[chunkId]?.();
		}

		this.#dirtyChunks.clear();
	}

	setOnChunkAdd(callback: () => void) {
		this.#onChunkAdd = callback;

		return () => {
			this.#onChunkAdd = () => {};
		};
	}

	setOnChunkUpdate(chunkId: number, callback: () => void) {
		this.#onChunkUpdateCbs[chunkId] = callback;

		return () => {
			this.#onChunkUpdateCbs[chunkId] = () => {};
		};
	}

	getChunk(chunkId: number): React.ReactNode[] | undefined {
		return this.#chunks[chunkId];
	}

	#addToChunk(sid: number): void {
		const id = this.extractId(sid);
		const chunkId = Math.floor(id / this.#chunkSize);
		const indexInChunk = id % this.#chunkSize;

		let chunkAdded = false;

		if (!this.#chunks[chunkId]) {
			this.#chunks[chunkId] = new Array(this.#chunkSize).fill(null);
			this.elements[chunkId] = jsx(Chunk, { id: chunkId, spawner: this }, chunkId);
			chunkAdded = true;
		}

		const chunk = this.#chunks[chunkId];
		chunk[indexInChunk] = this.#createEntityJSX(sid);

		if (chunkAdded) this.#onChunkAdd();
	}

	#removeFromChunk(sid: number): void {
		const id = this.extractId(sid);
		const chunkId = Math.floor(id / this.#chunkSize);
		const indexInChunk = id % this.#chunkSize;

		const chunk = this.#chunks[chunkId];
		chunk[indexInChunk] = null;
	}

	#combineIdAndGeneration(id: number, generation: number): number {
		return (generation << 20) | id;
	}

	extractId(sid: number): number {
		return sid & this.#maxId;
	}

	extractGeneration(sid: number): number {
		return sid >> 20;
	}

	#createEntityJSX(sid: number) {
		return jsx(this.component, { _sid: sid }, sid);
	}
}

const createEmitter = (spawner: Spawner) => {
	return memo(({ initial }: { initial?: number }) => {
		const initialSidRef = useRef<number[]>([]);
		const [, startTransition] = useTransition();
		const [, rerender] = useReducer((v) => v + 1, 0);
		const deferredRerender = () => startTransition(() => rerender());

		// Create initial entities.
		useLayoutEffect(() => {
			if (!initial) return;
			const initialSids = initialSidRef.current;

			for (let i = 0; i < initial; i++) {
				initialSids.push(spawner.queueSpawn());
			}

			spawner.processQueue();
			deferredRerender();

			return () => {
				for (let i = 0; i < initialSids.length; i++) {
					spawner.queueDestroy(initialSids[i]);
				}

				initialSidRef.current = [];
			};
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []);

		useEffect(() => {
			const unsub = spawner.setOnChunkAdd(deferredRerender);
			return unsub;
		}, []);

		return useMemo(() => spawner.elements, [spawner]);
	});
};

export function createSpawner(component: React.FunctionComponent<any>) {
	return new Spawner(component);
}

const Chunk = memo(({ id, spawner }: { id: number; spawner: Spawner }) => {
	const chunk = useMemo(() => spawner.getChunk(id), [id, spawner]);
	const [, rerender] = useReducer((v) => v + 1, 0);

	useEffect(() => {
		const unsub = spawner.setOnChunkUpdate(id, () => {
			rerender();
		});
		return unsub;
	}, [id, spawner]);

	return <>{chunk}</>;
});
