// oxlint-disable no-new-array
import { summary, bench, do_not_optimize, run, barplot } from 'mitata';

// https://v8.dev/blog/elements-kinds
// https://chromium-review.googlesource.com/c/v8/v8/+/6285929

// Map enum flags to human-readable labels
const OptimizationStatus = {
	kIsFunction: ['Function', 1 << 0],
	kNeverOptimize: ['Never optimize', 1 << 1],
	kMaybeDeopted: ['Maybe deoptimized', 1 << 2],
	kOptimized: ['Optimized', 1 << 3],
	kMaglevved: ['Maglev compiled', 1 << 4],
	kTurboFanned: ['Turbofan compiled', 1 << 5],
	kInterpreted: ['Interpreted', 1 << 6],
	kMarkedForOptimization: ['Marked for optimization', 1 << 7],
	kMarkedForConcurrentOptimization: ['Marked for concurrent optimization', 1 << 8],
	kOptimizingConcurrently: ['Optimizing concurrently', 1 << 9],
	kIsExecuting: ['Currently executing', 1 << 10],
	kTopmostFrameIsTurboFanned: ['Topmost frame is Turbofan', 1 << 11],
	kLiteMode: ['Lite mode', 1 << 12],
	kMarkedForDeoptimization: ['Marked for deoptimization', 1 << 13],
	kBaseline: ['Baseline compiled', 1 << 14],
	kTopmostFrameIsInterpreted: ['Topmost frame is Interpreted', 1 << 15],
	kTopmostFrameIsBaseline: ['Topmost frame is Baseline', 1 << 16],
	kIsLazy: ['Lazy function', 1 << 17],
	kTopmostFrameIsMaglev: ['Topmost frame is Maglev', 1 << 18],
	kOptimizeOnNextCallOptimizesToMaglev: ['Will optimize to Maglev on next call', 1 << 19],
	kOptimizeMaglevOptimizesToTurbofan: ['Maglev will optimize to Turbofan', 1 << 20],
	kMarkedForMaglevOptimization: ['Marked for Maglev optimization', 1 << 21],
	kMarkedForConcurrentMaglevOptimization: ['Marked for concurrent Maglev optimization', 1 << 22],
};

function printOptStatus(fn, name = fn.name || '<anonymous>') {
	const s = %GetOptimizationStatus(fn); // V8 intrinsic
	const flags = Object.values(OptimizationStatus)
		.filter(([_, bit]) => s & bit)
		.map(([label]) => label);

	console.log(`${name}: ${flags.length ? flags.join(', ') : 'No flags set'}`);
}

barplot(() => {
	summary(() => {
		bench('holey:sum $size', function* (state) {
			// Get the size from the range
			const size = state.get('size');

			/**
			 * This creates a holey array. The array is created with no elements
			 * and then a loop fills if afterwards.
			 */
			const array = new Array(size);
			for (let i = 0; i < size; i++) array[i] = 1.1;
			// %DebugPrint(array);

			function sum(array) {
				let sum = 0;
				for (let i = 0; i < array.length; i++) sum += array[i];
				return sum;
			}

			%PrepareFunctionForOptimization(sum);

			sum(array);

			%OptimizeFunctionOnNextCall(sum);

			// Precompute values passed into the bench
			yield {
				// Creates arg 0
				[0]() {
					return array;
				},
				// The actual bench function with arg 0 passed in
				bench(array) {
					return sum(array);
				},
			};

			printOptStatus(sum);
		})
			.range('size', 1, 1024)
			.gc('inner');

		bench('packed:sum $size', function* (state) {
			const size = state.get('size');
			const array = Array.from({ length: size }, () => 1.1);
			// %DebugPrint(array);

			function sum(array) {
				let sum = 0;
				for (let i = 0; i < array.length; i++) sum += array[i];
				return sum;
			}

			yield {
				[0]() {
					return array;
				},

				bench(array) {
					return sum(array);
				},
			};
		})
			.range('size', 1, 1024)
			.gc('inner');

		bench('f32:sum $size', function* (state) {
			const size = state.get('size');
			const array = new Float32Array(size);
			for (let i = 0; i < size; i++) array[i] = 1.1;
			// %DebugPrint(array);

			function sum(array) {
				let sum = 0;
				for (let i = 0; i < array.length; i++) sum += array[i];
				return sum;
			}

			yield {
				[0]() {
					return array;
				},

				bench(array) {
					return sum(array);
				},
			};
		})
			.range('size', 1, 1024)
			.gc('inner');

		bench('f64:sum $size', function* (state) {
			const size = state.get('size');
			const array = new Float64Array(size);
			for (let i = 0; i < size; i++) array[i] = 1.1;

			function sum(array) {
				let sum = 0;
				for (let i = 0; i < array.length; i++) sum += array[i];
				return sum;
			}

			yield {
				[0]() {
					return array;
				},

				bench(array) {
					return sum(array);
				},
			};
		})
			.range('size', 1, 1024)
			.gc('inner');

		bench('wasm_memory_f32:sum $size', function* (state) {
			const size = state.get('size');
			const bytesNeeded = size * 4;
			const pages = Math.ceil(bytesNeeded / 65536);

			// Create linear memory
			const memory = new WebAssembly.Memory({ initial: pages }); // optional: maximum: pages

			// Create a Float32 view at offset 0 with 'size' elements
			const array = new Float32Array(memory.buffer, 0, size);

			// Write into WASM memory
			for (let i = 0; i < size; i++) array[i] = 1.1;

			function sum(array) {
				let sum = 0;
				for (let i = 0; i < array.length; i++) sum += array[i];
				return sum;
			}

			yield {
				[0]() {
					return array;
				},

				bench(array) {
					return sum(array);
				},
			};
		})
			.range('size', 1, 1024)
			.gc('inner');
	});
});

await run();
