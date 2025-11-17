import { labelDelimiters, blockParseDelimiters } from "../../../constants/logDelimiters.js";
import DebugPrintBlock from "./DebugPrintBlock.js";
import RunOptStatusBlock from "./RunOptStatusBlock.js";
import RunKeyBlock from './RunKeyBlock.js';
import RunBenchBlock from './RunBenchBlock.js';

const labelSections = Object.fromEntries(Object.values(labelDelimiters).map((logString)=> {
    return [logString, (/*lines*/) => { return {'type':'label'}}]
}))

const blockParseSections = {
    [blockParseDelimiters.debugPrint]: DebugPrintBlock,
    [blockParseDelimiters.runOptStatus]: RunOptStatusBlock,
    [blockParseDelimiters.runKey]: RunKeyBlock,
    // collate trace logs 
    [blockParseDelimiters.runBench]: RunBenchBlock  
}


export default {
    ...labelSections,
    ...blockParseSections
}