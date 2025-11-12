import { microbench, run } from "../../api.js";

const SIZE = [100_000, 10_000]; 

microbench('Confirm A plotplot by Deleting a Property')
    .args('size', SIZE)
    .setup((args) => {
        return Array.from({length: args.size}, (v,i)=>i);
    })
    .measure((setupResult, benchI) => {
        function add(a, b) {
            return a + b;
        }
        for(let i = 0; i < setupResult.length; i++){
            if(i === 9999){
                setupResult[i] = add((Math.random() + 1).toString(36).substring(7), Math.random() * 100_000); 
                continue;
            }
            setupResult[i] = add(setupResult[i] + i)
        }
        return setupResult
    });

await run();