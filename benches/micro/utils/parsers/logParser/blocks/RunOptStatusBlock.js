import { logs } from "../../../constants/logDelimiters.js";
const runOptRegex = new RegExp(`^${logs.runOptStatus}: (.*)`);

const RunOptStatusBlock = (lines) => {
    let runOptStatus = ''
    if(!lines.length){
         return 'No Lines';
    }
    for(let i = 0; i < lines.length; i++){
        const line = lines[i];
        const match = line.match(runOptRegex);
        if (!match) {
            continue;
        }
        else{
            runOptStatus = match[i]
            break;
        }
    }
    if (!runOptStatus) {
        throw new Error(`Missing ${logs.runOptStatus}`);
    }

    return runOptStatus;
}

export default RunOptStatusBlock;