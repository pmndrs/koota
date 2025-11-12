import { /*describe,*/ microbench, run } from "../../api.js";

const SIZE = [1, 8, 64, 512, 1024, 10000];

// describe (
    microbench('Sum a HOLEY array of size $size')
        .setup(args => {
            const holeyArray = new Array(args.size);
            for (let i = 0; i < args.size; i+=2) {
                holeyArray[i] = i;
            }
            return { arrayToSum: holeyArray };
        })
        .debug(['arrayToSum'])
        .measure((setupResult, args) => {
            const arr = setupResult.arrayToSum;
            let sum = 0;
            for (let i = 0; i < arr.length; i++) {
                sum += arr[i];
            }
            return sum; // Implicitly wrapped in do_not_optimize by the API
        })
        .args('size', [SIZE]);


    // The user calls your API's run function.
    await run();
//)