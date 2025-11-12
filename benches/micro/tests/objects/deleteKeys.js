import { /*describe,*/ microbench, run } from "../../api.js";

const keys = [1, 10, 100];

// describe (
    microbench('deleting $keys from object')
        .setup(args => {
            const obj = {};
            for (let i = 0; i < args.keys; i++) obj[i] = i;
            return { obj: obj };
        })
        .debug(['obj'])
        .measure((setupResult, args) => {
            const obj = setupResult.obj;
            for (let i = 0; i < keys; i++) delete obj[i];
        })
        .args('keys', keys);


    // The user calls your API's run function.
    await run();
//)

/*

deleting 1 from object        90.45 ns/iter  91.90 ns    ▇█▇▆              
                     (83.72 ns … 212.24 ns) 108.14 ns   ▆████▇▃            
                    ( 27.16  b … 164.91  b)  80.19  b ▂▇███████▇▄▄▃▂▁▁▁▁▁▁▁

deleting 10 from object       98.53 ns/iter  95.15 ns  █                   
                       (82.98 ns … 1.26 µs) 258.20 ns  █                   
                    ( 28.97  b … 164.85  b)  80.17  b ▆█▆▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁

deleting 100 from object      91.81 ns/iter  93.28 ns    ▂▆█▇              
                     (82.89 ns … 135.97 ns) 112.30 ns    █████▂            
                    ( 20.45  b … 164.85  b)  80.17  b ▁▂▇██████▆▅▄▃▂▂▂▁▂▂▁▁


*/