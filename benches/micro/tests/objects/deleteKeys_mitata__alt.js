import { barplot, summary, bench, run } from "mitata";

barplot(() => {
    summary(() => {

bench('deleting $keys from object', function* (state) {
  const keys = state.get('keys');
  console.log("keys", keys)
  const obj = {};
  for (let i = 0; i < keys; i++) obj[i] = i;
  console.log({obj})
  yield {
    [0]() {
      return obj;
    },

    bench(p0) {
      for (let i = 0; i < keys; i++) delete p0[i];
    },
  };
}).args('keys', [1, 10, 100]).gc('inner');

    })
})

await run();

/*

deleting 1 from object        16.12 ns/iter  16.72 ns  █                   
                      (14.72 ns … 27.80 ns)  19.24 ns  █▄     █▆           
                    (  0.09  b …  75.78  b)   0.25  b ▄██▆▆█▇▅██▇▄▃▄▄▃▂▁▂▁▁

deleting 10 from object      163.37 ns/iter 165.77 ns             ▄█▆█▃    
                    (150.54 ns … 172.96 ns) 170.40 ns           ▂▆█████▆   
                    (  0.01  b … 310.47  b)   1.79  b ▂▂▄▃▂▃▂▃▅▅████████▆▃▁

deleting 100 from object       2.02 µs/iter   2.04 µs              ▄█▅     
                        (1.94 µs … 2.08 µs)   2.07 µs              ███     
                    ( 19.51  b … 148.63  b) 134.33  b ▅▁▄▄▄▁▂▂▅▂▇█████▇▄▁▂▄

*/