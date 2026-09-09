import assert from 'node:assert/strict';
import * as kernel from '../../packages/core/src/kernel';
import { createIrisDefinitions, iris } from './fixtures';

if (!iris) throw new Error('Set IRIS_SOURCE to the Iris source index.ts');
const definitions = createIrisDefinitions();
const irisA = iris.createWorld();
const irisB = iris.createWorld();
const first = iris.createEntity(irisA);
assert.equal(iris.createEntity(irisB), first);
assert.equal(iris.isEntityAlive(irisB, first), true);
let recycled = first;
for (let i = 0; i < 256; i++) {
  iris.destroyEntity(irisA, recycled);
  recycled = iris.createEntity(irisA);
}
assert.equal(recycled, first);
assert.equal(iris.isEntityAlive(irisA, first), true);
const oldPair = iris.pair(definitions.relation, recycled);
iris.addComponent(irisA, iris.createEntity(irisA), oldPair);
iris.destroyEntity(irisA, recycled);
const replacement = iris.createEntity(irisA);
assert.equal(iris.getPairTarget(irisA, oldPair), replacement);
assert.throws(() => iris!.pair(definitions.relation, oldPair));

const ctxA = kernel.createKernelContext();
const ctxB = kernel.createKernelContext();
kernel.initializeKernel(ctxA);
kernel.initializeKernel(ctxB);
const original = kernel.createEntity(ctxA);
assert.notEqual(kernel.createEntity(ctxB), original);
assert.equal(kernel.hasEntity(ctxB, original), false);
let current = original;
for (let i = 0; i < 256; i++) {
  kernel.destroyEntity(ctxA, current);
  current = kernel.createEntity(ctxA);
}
assert.notEqual(current, original);
assert.equal(kernel.hasEntity(ctxA, original), false);
const relation = kernel.defineRelation(ctxA);
const pair = kernel.pairEntity(ctxA, relation, current);
const nested = kernel.pairEntity(ctxA, relation, pair);
assert.equal(kernel.hasEntity(ctxA, nested), true);
kernel.destroyEntity(ctxA, current);
assert.equal(kernel.hasEntity(ctxA, pair), false);
assert.equal(kernel.hasEntity(ctxA, nested), false);
assert.notEqual(kernel.pairEntity(ctxA, relation, kernel.createEntity(ctxA)), pair);
kernel.destroyKernel(ctxA);
kernel.destroyKernel(ctxB);
iris.resetWorld(irisA);
iris.resetWorld(irisB);
console.log(
  'Verified cross-world identity, generation exhaustion, pair rebinding and nested-pair differences'
);
