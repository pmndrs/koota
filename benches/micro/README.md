# Micro Benchmarks

V8 microbenchmark harness for profiling array operations, object patterns, and other low-level JavaScript performance characteristics.

## Usage

### Running Benchmarks

From the project root:

```bash
# Run a benchmark (from project root)
pnpm micro arrays/packed.js

# The benchmark will complete and prompt you to view results
# Press 'y' to launch the viewer, or 'n' to exit
```

Or use the `--view` flag to automatically open the viewer:

```bash
pnpm micro arrays/packed.js --view
```

### Viewing Previous Results

If you want to view results from a previous benchmark run without re-running:

```bash
cd benches/micro
pnpm dev
# Then open http://localhost:5173
```

## How It Works

1. **Benchmark Execution**: The benchmark script runs with Node's native syntax flags (`--allow-natives-syntax`, `--trace-deopt`, `--expose-gc`)
2. **Log Capture**: All output (including V8 debug info) is written to `bench.log`
3. **Result Viewer**: A React-based UI parses and visualizes:
   - Benchmark timing results (via mitata)
   - V8 DebugPrint output (array elements kinds, maps, memory addresses)
   - Deoptimization traces
   - Function optimization status

## Features

- **Interactive Results**: Click memory addresses to highlight all references
- **Collapsible Sections**: Drill down into setup, first bench, post-bench phases
- **V8 Internals**: See elements kinds (PACKED_SMI, HOLEY_ELEMENTS, etc.)
- **Deopt Tracking**: Highlighted deoptimization warnings with reasons

