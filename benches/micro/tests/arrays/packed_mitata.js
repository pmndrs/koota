import { bench, run, do_not_optimize } from "mitata";
import runOptStatus from "../../utils/tools/runOptStatus.js";
let i = 0;
const SIZE = [1, 8, 64, 512, 1024, 10000];

bench('Sum a PACKED array of size $size', function* (state) {
            // Get the size from the range
            const size = state.get('size');
            /**
             * This creates a fixed array. The array is created with no elements
             * and then a loop fills if afterwards.
             */
            console.log("In generator", {size})
            const packedArray = Array.from({length: size}, (v,i)=>v);
            // console.log("Mitata", 'PackedArrayPostInit', %DebugPrint(packedArray));
            for (let i = 0; i < size; i++) {
                packedArray[i] = i;
            }
            const runKey = `Sum a PACKED array of size ${size}`;
            // console.log("Mitata", 'PackedArrayLooped', %DebugPrint(packedArray));
            
            // console.log("Mitata", 'SumPostInit', %DebugPrint(sum));
            // %PrepareFunctionForOptimization(sum);
            // sum(packedArray);
            // console.log("Mitata", 'Prepared For Opt');
            // %OptimizeFunctionOnNextCall(sum);
            // sum(packedArray);
            // console.log("Mitata", 'Sum Opt\'d');

            // Precompute values passed into the bench
            yield {
                // Creates arg 0
                [0]() {
                   return packedArray;
                },
                // The actual bench function with arg 0 passed in
                bench(packedArray) {
                    // console.log("--BENCH--");
                    // console.log('DebugPrint packedArray right before bench');
                    // %DebugPrint(packedArray)
                    function sum(array) {
                        let sum = 0;
                        for (let i = 0; i < array.length; i++) sum += array[i];
                        return sum;
                    }
                    console.log(`\n=============== ^^^^ ${runKey} ${i} ===============\n`)
                    i++
                    return do_not_optimize(sum(packedArray));
                    console.log("after");
                    console.log("Mitata", 'SumPostRun', %DebugPrint(sum));
                    console.log(runOptStatus(sum));
                },
            };
        })
            .args('size', SIZE)
            .gc('inner');


    await run();
//)

/*

Sum a PACKED array of size 1     128.02 µs/iter 129.75 µs            ██        
                         (96.75 µs … 218.17 µs) 149.79 µs ▁▁▁▁▁▁▁▁▁▁▆███▃▂▁▁▁▁▁
                      gc(548.46 µs … 968.08 µs)   6.97 kb (  3.12 kb…  1.10 mb)

[completed compiling 0x08d64e07f639 <JSFunction (sfi = 0x129f550d7d61)> (target MAGLEV) - took 0.000, 0.292, 0.000 ms]
Sum a PACKED array of size 8     144.28 µs/iter 145.92 µs                █     
                        (106.88 µs … 168.58 µs) 156.13 µs ▁▁▁▁▁▁▁▁▁▁▁▁▁▂▇██▄▂▁▁
                      gc(553.21 µs … 986.75 µs)   4.00 kb (904.00  b…219.70 kb)

Sum a PACKED array of size 64    264.62 µs/iter 266.83 µs                  █▂  
                        (202.58 µs … 283.50 µs) 274.88 µs ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▃██▂▁
                      gc(555.25 µs …   1.15 ms)   4.71 kb (592.00  b…411.70 kb)

Sum a PACKED array of size 512     1.23 ms/iter   1.25 ms              █▃      
                          (951.17 µs … 1.53 ms)   1.36 ms ▁▁▁▁▁▁▁▁▁▁▁▁▁██▆▃▂▁▁▁
                      gc(569.33 µs …   1.42 ms)   3.45 kb (  3.45 kb…  4.46 kb)

Sum a PACKED array of size 1024    2.37 ms/iter   2.48 ms              █       
                            (1.97 ms … 2.71 ms)   2.67 ms ▂▃▄▃▃▃▄▄▃▃▃▃███▆▆▅▄▂▁
                      gc(582.04 µs …   1.68 ms)   3.44 kb (648.00  b…  4.61 kb)

Sum a PACKED array of size 10000  19.41 ms/iter  19.52 ms  ▃  █  ▃ ▃▆  ▃▃   ▆  
                          (19.17 ms … 19.70 ms)  19.65 ms ██▄▆█▆▄████▄████▆▆█▆▆
                      gc(579.67 µs …   1.04 ms)   3.40 kb (648.00  b…  3.45 kb)

*/