import { summary, barplot, bench, do_not_optimize, run } from "mitata";



barplot(() => {summary(() => {
    bench('new Array($size)', function* (state) {
    const size = state.get('size');
    yield () => do_not_optimize(new Array(size));
    }).args('size', [1, 5, 10, 1000, 10000]).gc('inner')
})})

await run();

`
new Array(1)                   2.16 ns/iter   2.00 ns  █                   
                       (1.50 ns … 10.89 ns)   8.92 ns ▁█▃▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
                  gc(635.13 µs …   1.69 ms)  40.84  b ( 40.10  b…101.94  b)

new Array(5)                   2.65 ns/iter   2.48 ns  █                   
                       (1.88 ns … 10.24 ns)   9.68 ns ▁█▇▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
                  gc(618.25 µs …   1.09 ms)  72.70  b ( 72.15  b… 96.12  b)

[completed compiling 0x02df939f7fa9 <JSFunction (sfi = 0x2df939d5f59)> (target MAGLEV) OSR - took 0.000, 0.666, 0.042 ms]
new Array(10)                  3.67 ns/iter   3.51 ns   █                  
                       (2.54 ns … 11.31 ns)  10.40 ns ▁▁█▄▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
                  gc(606.08 µs …   1.13 ms) 112.56  b (  7.37  b…144.12  b)

new Array(1000)              377.80 ns/iter 390.14 ns   ▃▄▆▅▇█▃▃▃          
                    (337.97 ns … 453.06 ns) 442.94 ns ▂▄█████████▆▆▅▄▅▄▄▂▂▁
                  gc(559.17 µs … 972.75 µs)   7.99 kb (  7.93 kb…  8.00 kb)

new Array(10000)               2.67 µs/iter   2.66 µs  ▅█                  
                        (2.61 µs … 2.98 µs)   2.95 µs ▅███▃▁▁▁▁▁▁▁▁▂▁▁▁▁▁▁▁
                  gc(562.54 µs … 943.42 µs)   5.42 kb (  5.39 kb…  5.43 kb)

                             ┌                                            ┐
                new Array(1) ┤ 2.16 ns
                new Array(5) ┤ 2.65 ns
               new Array(10) ┤ 3.67 ns
             new Array(1000) ┤■■■■■ 377.80 ns
            new Array(10000) ┤■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ 2.67 µs
                             └                                            ┘

summary
  new Array(1)
   1.23x faster than new Array(5)
   1.7x faster than new Array(10)
   174.59x faster than new Array(1000)
   1233.41x faster than new Array(10000)
`