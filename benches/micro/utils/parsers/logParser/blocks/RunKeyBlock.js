import { logs } from "../../../constants/logDelimiters.js";
const runKeyRegex = new RegExp(`^${logs.runKey}: (.*)`);

const RunKeyBlock = (lines) => {
    let runKey = ''
    if(!lines.length){
         return 'No Lines';
    }
    for(let i = 0; i < lines.length; i++){
        const line = lines[i];
        const match = line.match(runKeyRegex);
        if (!match) {
            continue;
        }
        else{
            runKey = match[i]
            break;
        }
    }
    if (!runKey) {
        throw new Error(`Missing ${logs.runKey}`);
    }

    return runKey;
}

export default RunKeyBlock;