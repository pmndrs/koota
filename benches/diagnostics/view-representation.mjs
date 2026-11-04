// oxlint-disable typescript/no-implied-eval -- V8 intrinsics are compiled dynamically for diagnostics.
// Populate .labs/build/asserts-off with a compiled benchmark first.
// node --allow-natives-syntax benches/diagnostics/view-representation.mjs
// Add --print-opt-code --print-opt-code-filter='create*' before the path and --codegen after it.
const { createWorld, trait } = await import(
  new URL('../.labs/build/asserts-off/index.js', import.meta.url).href
);

const world = createWorld();
const Tag = trait();
world.spawn(Tag);
const original = world.query(Tag);
const prototype = Object.getPrototypeOf(original);
const View = prototype.constructor;
const { ctx, query, binding, source, live } = original;

function createClass() {
  return new View(ctx, query, binding, source, live);
}

function ViewState(ctx, query, binding, source, live) {
  this.ctx = ctx;
  this.query = query;
  this.binding = binding;
  this.source = source;
  this.live = live;
  this.layout = undefined;
  this.iterator = undefined;
}
ViewState.prototype = prototype;

function createConstructor() {
  return new ViewState(ctx, query, binding, source, live);
}

function createLiteral() {
  return {
    __proto__: prototype,
    ctx,
    query,
    binding,
    source,
    live,
    layout: undefined,
    iterator: undefined,
  };
}

function createAssigned() {
  return Object.assign(Object.create(prototype), {
    ctx,
    query,
    binding,
    source,
    live,
    layout: undefined,
    iterator: undefined,
  });
}

const fastProperties = new Function('value', 'return %HasFastProperties(value)');
const sameMap = new Function('left', 'right', 'return %HaveSameMap(left, right)');
const debug = new Function('value', '%DebugPrint(value)');
for (const create of [createClass, createConstructor, createLiteral, createAssigned]) {
  // Finish constructor slack tracking before comparing object sizes.
  for (let i = 0; i < 16; i++) create();
  if (process.argv.includes('--codegen')) {
    new Function('fn', '%PrepareFunctionForOptimization(fn)')(create);
    for (let i = 0; i < 100; i++) create();
    new Function('fn', '%OptimizeFunctionOnNextCall(fn)')(create);
  }
  const first = create();
  const second = create();
  console.log(
    JSON.stringify({
      name: create.name,
      fastProperties: fastProperties(first),
      stableMap: sameMap(first, second),
      sharedEach: first.each === original.each,
      sharedIterator: first[Symbol.iterator] === original[Symbol.iterator],
    })
  );
  debug(first);
}
world.destroy();
