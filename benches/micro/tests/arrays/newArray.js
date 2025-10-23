import { /*describe,*/ microbench, run } from "../../api.js";

microbench('new Array($size)')
    .measure((setupResult, args) => {
        new Array(args.size);
    })
    .args('size', [1, 5, 10, 1000, 10000]);

await run();

`
new Array(1)                   2.22 ns/iter   2.31 ns  █                   
                       (2.03 ns … 42.78 ns)   3.49 ns  █  ▆                
                    (  0.10  b … 103.29  b)   0.12  b ██▂▂█▂▁▁▂▁▁▁▁▂▁▁▁▁▁▁▁

new Array(5)                   2.06 ns/iter   2.15 ns    ▆   █             
                       (1.81 ns … 11.04 ns)   2.78 ns  ▄▇█  ▅█             
                    (  0.10  b …  43.81  b)   0.11  b ▁███▃▂██▄▁▁▁▁▁▁▁▁▁▁▁▁

new Array(10)                  2.06 ns/iter   2.15 ns  █▂   █              
                        (1.86 ns … 8.51 ns)   2.76 ns  ██   █▇             
                    (  0.10  b …  20.22  b)   0.11  b ▆██▂▂▆██▁▁▁▁▁▁▁▁▁▁▁▁▂

new Array(1000)                2.08 ns/iter   2.16 ns  ▃█  ▃               
                        (1.82 ns … 7.91 ns)   3.18 ns  ██ ▂█               
                    (  0.10  b …  20.22  b)   0.11  b ▁██▂██▃▂▂▂▂▁▂▂▂▁▁▁▁▁▁

new Array(10000)               2.07 ns/iter   2.16 ns  █    ▆              
                       (1.87 ns … 10.36 ns)   2.79 ns  █▂   █              
                    (  0.10  b …  26.10  b)   0.11  b ▃██▂▂▄█▄▁▁▁▁▁▁▁▁▁▁▁▁▁

`