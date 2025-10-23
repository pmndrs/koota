import logDelimiters from "../constants/logDelimiters.js";

const debugPrint = (obj) => {
    for (const [key, value] of Object.entries(obj)){
        console.log(`${logDelimiters.debugPrint.start} ${key}`);
        %DebugPrint(value);
        console.log(`${logDelimiters.debugPrint.end} ${key}`);
    }
} 

export default debugPrint