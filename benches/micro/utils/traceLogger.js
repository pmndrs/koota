import debugPrint from './tools/debugPrint.js'
import logDelimiters, { logs } from './constants/logDelimiters.js';
import runOptStatus from './tools/runOptStatus.js';

// setup, firstBench, postBench
let steps = [0, 0, 0];
let runKey = "";

const checkSteps = (expectedStep) => {
  if (steps[expectedStep] === 1) {
    return false;
  }
  if (expectedStep > 0 && 
        steps.some((stepValue, i) => i < expectedStep &&
            stepValue === 0
        )
    ){
        console.error(outOfOrder)
        return false;
    }
  return true;
};

const reset = () => {
  runKey = "";
  steps = [0, 0, 0];
};

const _recordSetup = (setupResult, title, currentArgs) => {
  runKey = `${title}__${JSON.stringify(currentArgs)}`;
  console.log(`${logDelimiters.runKey.start}`);
  console.log(`${logs.runKey}: ${runKey}`)
  console.log(`${logDelimiters.runKey.end}`);
  debugPrint({setupResult});
};

const _recordFirstBench = (setupResult, toBench, result) => {
    /* Prepare Opt */
    %PrepareFunctionForOptimization(toBench);
    toBench(setupResult);
    %OptimizeFunctionOnNextCall(toBench);
    toBench(setupResult);
    runOptStatus(toBench);
    /* Fin Prepare Opt */
    
    debugPrint({setupResult});
    debugPrint({toBench});
    if(result !== setupResult) {
        debugPrint({result});
    }
}

const _recordPostBench = (setupResult, toBench, i) => {
    console.log(`Total Runs: ${i}`);
    debugPrint({setupResult});
    runOptStatus(toBench);
    debugPrint({toBench});
}

const log = (stepIndex, delimiter, recordFn) => {
  
  return (...args) => {
    if (!checkSteps(stepIndex)) {
      return;
    }

    if(stepIndex === 2){
      console.log(logDelimiters.runBench.end)
    }

    console.log(delimiter.start);    
    recordFn(...args);
    console.log(delimiter.end);

    if(stepIndex === 1){
      console.log(logDelimiters.runBench.start)
    }

    if (stepIndex === 2) {
      reset();
    } else {
      steps[stepIndex] = 1;
    }
  };
};

const traceLogger = {
  recordSetup: log(0, logDelimiters.setup, _recordSetup),
  recordFirstBench: log(1, logDelimiters.firstBench, _recordFirstBench),
  recordPostBench: log(2, logDelimiters.postBench, _recordPostBench)
};

export default traceLogger;