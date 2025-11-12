// const optRegex = /^/;
const deoptRegex = /\[bailout \(kind: ([^,]+), reason: ([^)]+)\):.*?deoptimizing (0x[0-9a-fA-F]+)/;

const RunBenchBlock = (lines) => {
    // let opts = [];
    let deopts = [];
    // other traces go here...
    // let gc = [];
    if(!lines.length){
         return 'No Lines';
    }
    for(let i = 0; i < lines.length; i++){
        const line = lines[i];
        // const optMatch = line.match(optRegex);
        // if (optMatch) {
        //     opts.push(optMatch);
        //     continue;
        // }
        const deOptMatch = line.match(deoptRegex);
        if(deOptMatch){
            deopts.push(deOptMatch)
            continue;
        }
    }

    return { trace: { /*opts,*/ deopts} };
}

export default RunBenchBlock;