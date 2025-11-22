import { run, microbench } from '../../api.js';

const SIZE = 1024;

// Test 1: SMI (Small Integer) in regular array
microbench('Read/Write SMI in Array (size $size)')
	.args('size', [SIZE])
	.setup((args) => {
		const arr = Array.from({ length: args.size }, (v, i) => v);
		for (let i = 0; i < args.size; i++) {
			arr[i] = i;
		}
		return arr;
	})
	.measure((arr) => {
		let sum = 0;
		// Read
		for (let i = 0; i < arr.length; i++) {
			sum += arr[i];
		}
		// Write
		for (let i = 0; i < arr.length; i++) {
			arr[i] = i + 1;
		}
		return sum;
	});

// Test 2: Doubles in regular array
microbench('Read/Write Doubles in Array (size $size)')
	.args('size', [SIZE])
	.setup((args) => {
		const arr = Array.from({ length: args.size }, (v, i) => v);
		for (let i = 0; i < args.size; i++) {
			arr[i] = i + 0.5; // Force double representation
		}
		return arr;
	})
	.measure((arr) => {
		let sum = 0;
		// Read
		for (let i = 0; i < arr.length; i++) {
			sum += arr[i];
		}
		// Write
		for (let i = 0; i < arr.length; i++) {
			arr[i] = i + 1.5;
		}
		return sum;
	});

// Test 3: Int32Array
microbench('Read/Write Int32Array (size $size)')
	.args('size', [SIZE])
	.setup((args) => {
		const arr = new Int32Array(args.size);
		for (let i = 0; i < args.size; i++) {
			arr[i] = i;
		}
		return arr;
	})
	.measure((arr) => {
		let sum = 0;
		// Read
		for (let i = 0; i < arr.length; i++) {
			sum += arr[i];
		}
		// Write
		for (let i = 0; i < arr.length; i++) {
			arr[i] = i + 1;
		}
		return sum;
	});

// Test 4: Uint32Array
microbench('Read/Write Uint32Array (size $size)')
	.args('size', [SIZE])
	.setup((args) => {
		const arr = new Uint32Array(args.size);
		for (let i = 0; i < args.size; i++) {
			arr[i] = i;
		}
		return arr;
	})
	.measure((arr) => {
		let sum = 0;
		// Read
		for (let i = 0; i < arr.length; i++) {
			sum += arr[i];
		}
		// Write
		for (let i = 0; i < arr.length; i++) {
			arr[i] = i + 1;
		}
		return sum;
	});

// Test 5: Float32Array
microbench('Read/Write Float32Array (size $size)')
	.args('size', [SIZE])
	.setup((args) => {
		const arr = new Float32Array(args.size);
		for (let i = 0; i < args.size; i++) {
			arr[i] = i + 0.5;
		}
		return arr;
	})
	.measure((arr) => {
		let sum = 0;
		// Read
		for (let i = 0; i < arr.length; i++) {
			sum += arr[i];
		}
		// Write
		for (let i = 0; i < arr.length; i++) {
			arr[i] = i + 1.5;
		}
		return sum;
	});

// Test 6: Float64Array
microbench('Read/Write Float64Array (size $size)')
	.args('size', [SIZE])
	.setup((args) => {
		const arr = new Float64Array(args.size);
		for (let i = 0; i < args.size; i++) {
			arr[i] = i + 0.5;
		}
		return arr;
	})
	.measure((arr) => {
		let sum = 0;
		// Read
		for (let i = 0; i < arr.length; i++) {
			sum += arr[i];
		}
		// Write
		for (let i = 0; i < arr.length; i++) {
			arr[i] = i + 1.5;
		}
		return sum;
	});

await run();

/*
Expected performance order (fastest to slowest):
1. SMI in Array - highly optimized, no boxing
2. Int32Array - direct memory access, no boxing
3. Uint32Array - similar to Int32Array
4. Float64Array - native double precision
5. Doubles in Array - boxed doubles, more overhead
6. Float32Array - may have conversion overhead to/from Float64

This will show:
- SMI arrays use PACKED_SMI_ELEMENTS (fastest)
- Double arrays use PACKED_DOUBLE_ELEMENTS (slower, boxed)
- Typed arrays bypass V8's elements system entirely
*/
