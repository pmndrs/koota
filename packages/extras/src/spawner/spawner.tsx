import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class Spawner {
	component: React.FunctionComponent<any>;
	sids: number[] = [];

	#pointer = 0;
	#spawnCallbacks: ((sid: number) => void)[] = [];
	#destroyCallbacks: ((sid: number) => void)[] = [];

	constructor(component: React.FunctionComponent<any>) {
		this.component = component;
	}

	Emitter = createEmitter(this);

	spawn(): number {
		const sid = this.#pointer++;
		this.sids.push(sid);

		// Call spawn callbacks.
		this.#spawnCallbacks.forEach((callback) => {
			callback(sid);
		});

		return sid;
	}

	destroy(sid: number) {
		const index = this.sids.indexOf(sid);
		if (index === -1) return;
		this.sids.splice(index, 1);

		// Call destroy callbacks.
		this.#destroyCallbacks.forEach((callback) => {
			callback(sid);
		});
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
}

const createEmitter = (spawner: Spawner) => {
	return ({ initial }: { initial?: number }) => {
		const initialSidRef = useRef<number[]>([]);
		const rerender = useReducer((x) => x + 1, 0)[1];

		// Create initial entities.
		useLayoutEffect(() => {
			if (!initial) return;
			const initialSids = initialSidRef.current;

			for (let i = 0; i < initial; i++) {
				initialSids.push(spawner.spawn());
			}

			rerender();

			return () => {
				for (let i = 0; i < initialSids.length; i++) {
					spawner.destroy(initialSids[i]);
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

		const entities = spawner.sids.map((sid) => {
			return <spawner.component key={sid} />;
		});

		return entities;
	};
};
