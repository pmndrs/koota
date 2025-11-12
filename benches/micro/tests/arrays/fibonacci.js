import { run, microbench } from '../../api.js';

microbench('fibonacci(40)')
        .setup(args => {
            function fibonacci(n) {
                if (n <= 1) return n;
                return fibonacci(n - 1) + fibonacci(n - 2);
            }
            return {fibonacci}
        })
        .debug(['fibonacci'])
        .measure((setupResult) => {
            setupResult.fibonacci(40);
        })

    await run();


/*

fibonacci(40)                634.61 ms/iter 646.83 ms          █     █  █  
                    (604.53 ms … 654.45 ms) 651.35 ms █▁▁█▁▁▁▁▁██▁▁▁▁██▁█▁█
                  gc(815.54 µs …   1.75 ms)   7.93 kb (696.00  b… 17.77 kb)

*/