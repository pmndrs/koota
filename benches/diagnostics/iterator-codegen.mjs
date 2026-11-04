// oxlint-disable typescript/no-implied-eval -- V8 intrinsics are compiled dynamically for diagnostics.
// Run a compiled benchmark first to populate .labs/build/asserts-off.
// node --allow-natives-syntax --print-bytecode --print-bytecode-filter=walk \
//   --print-opt-code --print-opt-code-filter=walk --trace-turbo-inlining \
//   benches/diagnostics/iterator-codegen.mjs query
// Modes: array, subclass, delegated, query, sorted, relation.
const { createWorld, ordered, relation, trait } = await import(
  new URL('../.labs/build/asserts-off/index.js', import.meta.url).href
);

const mode = process.argv[2] ?? 'query';
const Tag = trait();
const ChildOf = relation();
const Children = ordered(ChildOf);
const world = createWorld();
const parent = world.spawn(Children);
for (let i = 0; i < 10000; i++) world.spawn(Tag, ChildOf(parent));
const query = world.query(Tag);
const dense = query.toArray();
class ArrayView extends Array {
  context = null;
  binding = null;
  version = 0;
}
class NativeView {
  constructor(dense) {
    this.dense = dense;
  }
  [Symbol.iterator]() {
    return this.dense[Symbol.iterator]();
  }
}
let iterable;
switch (mode) {
  case 'array':
    iterable = dense;
    break;
  case 'subclass':
    iterable = new ArrayView();
    for (const entity of dense) iterable.push(entity);
    break;
  case 'delegated':
    iterable = new NativeView(dense);
    break;
  case 'query':
    iterable = query;
    break;
  case 'sorted':
    iterable = query.sort((a, b) => a - b, [Tag]);
    break;
  case 'relation':
    iterable = parent.get(Children);
    break;
  default:
    throw new Error(`Unknown mode ${mode}`);
}
function walk(input) {
  let sum = 0;
  for (const entity of input) sum = (sum + entity) | 0;
  return sum;
}
new Function('fn', '%PrepareFunctionForOptimization(fn)')(walk);
let sum = 0;
for (let i = 0; i < 100; i++) sum = walk(iterable);
new Function('fn', '%OptimizeFunctionOnNextCall(fn)')(walk);
sum = walk(iterable);
const expected = dense.reduce((total, entity) => (total + entity) | 0, 0);
if (sum !== expected) throw new Error('Invalid sum');
console.log(
  JSON.stringify({ mode, sum, status: new Function('fn', 'return %GetOptimizationStatus(fn)')(walk) })
);
if (process.argv.includes('--shapes')) {
  const debug = new Function('value', '%DebugPrint(value)');
  debug(Object.getPrototypeOf(iterable));
  const cursor = iterable[Symbol.iterator]();
  console.log(cursor.next.toString());
  debug(cursor.next);
  cursor.return?.();
}
