import { /*describe,*/ run, microbench } from "../../api.js";

const SIZE = [64, 512, 1024, 10000, 1, 8] // [1, 8, 64, 512, 1024, 10000];

// describe (
    microbench('Sum a PACKED array of size $size')
        .args('size', SIZE)
        .setup(args => {
            const packedArray = Array.from({length: args.size}, (v,i)=>v);
            for (let i = 0; i < args.size; i++) {
                packedArray[i] = i;
            }
            return packedArray;
        })
        .measure((setupResult) => {
            const arr = setupResult;
            let sum = 0;
            for (let i = 0; i < arr.length; i++) {
                sum += arr[i];
            }
            return sum;
        });

        await run();
//)

/*

Sum a PACKED array of size 1       2.30 ns/iter   2.01 ns  █                   
                           (1.48 ns … 11.92 ns)   9.78 ns ▁█▁▁▁▁▁▁▂▁▁▁▁▁▁▁▁▁▁▁▁
                      gc(608.42 µs … 997.21 µs)   0.82  b (  0.10  b…103.80  b)

Sum a PACKED array of size 8       3.12 ns/iter   2.76 ns   █                  
                           (2.01 ns … 10.20 ns)   9.62 ns ▁▁█▁▁▁▁▁▁▂▁▁▁▁▁▁▁▁▁▁▁
                      gc(606.71 µs …   2.79 ms)   0.86  b (  0.10  b… 55.22  b)

Sum a PACKED array of size 64      4.12 ns/iter   3.77 ns    █                 
                           (2.68 ns … 12.87 ns)  10.02 ns ▁▂▁█▁▁▁▂▁▁▁▁▁▁▁▁▁▁▁▁▁
                      gc(597.79 µs …   1.59 ms)   1.03  b (  0.10  b… 32.11  b)

Sum a PACKED array of size 512     3.73 ns/iter   3.68 ns        █             
                            (2.69 ns … 9.98 ns)   5.42 ns ▁▁▁▁▁▁▁█▃▁▁▁▁▁▁▁▁▁▁▁▁
                      gc(618.88 µs …   1.25 ms)   0.23  b (  0.10  b… 16.10  b)

Sum a PACKED array of size 1024    2.92 ns/iter   2.75 ns   █                  
                           (2.06 ns … 10.97 ns)   9.38 ns ▁▁█▁▁▁▁▁▁▂▁▁▁▁▁▁▁▁▁▁▁
                      gc(550.83 µs … 969.63 µs)   0.44  b (  0.10  b… 39.22  b)


Sum a PACKED array of size 10000   3.78 ns/iter   3.72 ns        █             
                           (2.72 ns … 10.02 ns)   5.45 ns ▁▁▁▁▁▁▁█▃▁▁▁▁▁▁▁▁▁▁▁▁
                      gc(617.25 µs …   1.22 ms)   0.34  b (  0.10  b… 72.10  b)

*/