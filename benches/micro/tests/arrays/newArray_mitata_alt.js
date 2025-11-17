import { measure } from 'mitata';

const stats = await measure(function* (state) {
  const size = state.get('x');

  yield {
    [0]() {
      return size;
    },

    bench(size) {
      return new Array(size);
    },
  };
}, {
  args: { x: [1, 5, 10, 1000, 10000] },
});

// explore how magic happens
console.log(stats.debug) // -> jit optimized source code of benchmark