import { run, bench, boxplot, summary } from 'mitata';

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}



boxplot(() => {
  summary(() => {
    bench('fibonacci(40) mitata', () => fibonacci(40)).gc('inner');
  });
});

await run();

/*
fibonacci(40) mitata         638.43 ms/iter 647.77 ms      ███             
                    (608.02 ms … 682.92 ms) 665.92 ms █▁▁▁▁███▁▁▁▁▁██▁▁█▁▁█
                  gc(632.04 µs …   1.19 ms)   7.90 kb (696.00  b… 17.77 kb)

                             ┌                                            ┐
                             ╷           ┌───────────┬──────┐             ╷
        fibonacci(40) mitata ├───────────┤           │      ├─────────────┤
                             ╵           └───────────┴──────┘             ╵
                             └                                            ┘
                             608.02 ms         636.97 ms          665.92 ms

*/