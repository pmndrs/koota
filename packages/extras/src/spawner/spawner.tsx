import { SparseSet } from 'koota/utils';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SpawnerContext } from './spawner-context';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class Spawner {
	#pointer = 0;
	#spawnCallbacks: ((sid: number) => void)[] = [];
	#destroyCallbacks: ((sid: number) => void)[] = [];
	#sparseSet = new SparseSet();
	#pendingSpawns = new SparseSet();
	#pendingDestroys: number[] = [];
	#recycleBin: number[] = [];

	entities: JSX.Element[] = [];
	component: React.FunctionComponent<any>;

	get sids(): readonly number[] {
		return this.#sparseSet.dense;
	}

	constructor(component: React.FunctionComponent<any>) {
		this.component = component;
	}

	Emitter = createEmitter(this);

	spawn(): number {
		const sid = this.#recycleBin.length ? this.#recycleBin.pop()! : this.#pointer++;
		this.#sparseSet.add(sid);

		// Create entity JSX.
		const newEntity = (
			<SpawnerContext.Provider key={sid} value={{ sid }}>
				<this.component />
			</SpawnerContext.Provider>
		);
		this.entities.push(newEntity);

		// Call spawn callbacks.
		this.#spawnCallbacks.forEach((callback) => {
			callback(sid);
		});

		return sid;
	}

	destroy(sid: number) {
		const index = this.#sparseSet.getIndex(sid);
		this.#sparseSet.remove(sid);

		// Mirror the SparseSet's removal process
		const lastEntity = this.entities.pop()!;
		if (index !== this.entities.length) {
			this.entities[index] = lastEntity;
		}

		this.#recycleBin.push(sid);

		// Call destroy callbacks.
		this.#destroyCallbacks.forEach((callback) => {
			callback(sid);
		});
	}

	queueSpawn(): number {
		const sid = this.#recycleBin.length ? this.#recycleBin.pop()! : this.#pointer++;
		this.#pendingSpawns.add(sid);
		return sid;
	}

	queueDestroy(sid: number): void {
		if (this.#sparseSet.has(sid)) {
			this.#recycleBin.push(sid);
			this.#pendingDestroys.push(sid);
			// Remove from spawn queue.
		} else if (this.#pendingSpawns.has(sid)) {
			this.#pendingSpawns.remove(sid);
		}
	}

	processedQueued(): void {
		// Process destroys first
		for (const sid of this.#pendingDestroys) {
			if (this.#sparseSet.has(sid)) {
				const index = this.#sparseSet.getIndex(sid);
				this.#sparseSet.remove(sid);

				const lastEntity = this.entities.pop()!;
				if (index !== this.entities.length) {
					this.entities[index] = lastEntity;
				}

				this.#destroyCallbacks.forEach((callback) => callback(sid));
			}
		}

		// Process spawns
		for (const sid of this.#pendingSpawns.dense) {
			this.#sparseSet.add(sid);
			this.entities.push(this.#createEntityJSX(sid));
			this.#spawnCallbacks.forEach((callback) => callback(sid));
		}

		// Clear pending operations
		this.#pendingSpawns.clear();
		this.#pendingDestroys = [];
	}

	onSpawn(callback: (sid: number) => void): () => void {
		this.#spawnCallbacks.push(callback);

		return () => {
			const index = this.#spawnCallbacks.indexOf(callback);
			if (index === -1) return;
			this.#spawnCallbacks.splice(index, 1);
		};
	}

	onDestroy(callback: (sid: number) => void): () => void {
		this.#destroyCallbacks.push(callback);

		return () => {
			const index = this.#destroyCallbacks.indexOf(callback);
			if (index === -1) return;
			this.#destroyCallbacks.splice(index, 1);
		};
	}

	#createEntityJSX(sid: number) {
		return <this.component key={sid} _sid={sid} />;
	}
}

const createEmitter = (spawner: Spawner) => {
	return ({ initial }: { initial?: number }) => {
		const initialSidRef = useRef<number[]>([]);

		const [, setVersion] = useState(0);
		const rerender = useCallback(() => setVersion((v) => v + 1), []);

		// Create initial entities.
		useLayoutEffect(() => {
			if (!initial) return;
			const initialSids = initialSidRef.current;

			for (let i = 0; i < initial; i++) {
				initialSids.push(spawner.queueSpawn());
			}

			spawner.processedQueued();
			rerender();

			return () => {
				for (let i = 0; i < initialSids.length; i++) {
					spawner.queueDestroy(initialSids[i]);
				}

				initialSidRef.current = [];
			};
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []);

		// Subscribe to spawn and destroy events.
		useEffect(() => {
			const unsubSpawn = spawner.onSpawn(rerender);
			const unsubDestroy = spawner.onDestroy(rerender);

			return () => {
				unsubSpawn();
				unsubDestroy();
			};
		}, [rerender]);

		return spawner.entities;
	};
};

export function createSpawner(component: React.FunctionComponent<any>) {
	return new Spawner(component);
}
