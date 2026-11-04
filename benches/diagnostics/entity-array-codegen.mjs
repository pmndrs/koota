// oxlint-disable typescript/no-implied-eval -- V8 intrinsics are compiled dynamically for diagnostics.
// Build the publish package, then inspect native traversal through its entity array getters.
// NODE_ENV=production node --allow-natives-syntax --print-bytecode --print-bytecode-filter=walk \
//   --print-opt-code --print-opt-code-filter=walk --trace-turbo-inlining \
//   benches/diagnostics/entity-array-codegen.mjs query
// Modes: array, query, sorted. Run each mode in a separate process.
const { createWorld, trait } = await import('../../packages/publish/dist/index.js');
const mode = process.argv[2] ?? 'query';
const world = createWorld();
const Included = trait();
for (let i = 0; i < 10_000; i++) world.spawn(Included);
const query = world.query(Included);
let view;
switch (mode) {
  case 'array':
    view = { entities: query.toArray() };
    break;
  case 'query':
    view = query;
    break;
  case 'sorted':
    view = query.sort((a, b) => a - b, [Included]);
    break;
  default:
    throw new Error(`Unknown mode ${mode}`);
}

function walk(view) {
  const entities = view.entities;
  let sum = 0;
  for (let i = 0, length = entities.length; i < length; i++) {
    sum = (sum + entities[i]) | 0;
  }
  return sum;
}

new Function('fn', '%PrepareFunctionForOptimization(fn)')(walk);
for (let i = 0; i < 100; i++) walk(view);
new Function('fn', '%OptimizeFunctionOnNextCall(fn)')(walk);
const sum = walk(view);
const expected = query.toArray().reduce((total, entity) => (total + entity) | 0, 0);
if (sum !== expected) throw new Error('Invalid sum');
console.log(
  JSON.stringify({ mode, sum, status: new Function('fn', 'return %GetOptimizationStatus(fn)')(walk) })
);
world.destroy();
