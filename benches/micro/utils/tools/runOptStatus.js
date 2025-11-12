// Map enum flags to human-readable labels

import logDelimiters, { logs } from "../constants/logDelimiters.js";

// https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/runtime/runtime.h#1083
const OptimizationStatus = {
	kIsFunction: ['Function', 1 << 0],
	kNeverOptimize: ['Never optimize', 1 << 1],
	kMaybeDeopted: ['Maybe deoptimized', 1 << 2],
	kOptimized: ['Optimized', 1 << 3],
	kMaglevved: ['Maglev compiled', 1 << 4],
	kTurboFanned: ['Turbofan compiled', 1 << 5],
	kInterpreted: ['Interpreted', 1 << 6],
	kMarkedForOptimization: ['Marked for optimization', 1 << 7],
	kMarkedForConcurrentOptimization: ['Marked for concurrent optimization', 1 << 8],
	kOptimizingConcurrently: ['Optimizing concurrently', 1 << 9],
	kIsExecuting: ['Currently executing', 1 << 10],
	kTopmostFrameIsTurboFanned: ['Topmost frame is Turbofan', 1 << 11],
	kLiteMode: ['Lite mode', 1 << 12],
	kMarkedForDeoptimization: ['Marked for deoptimization', 1 << 13],
	kBaseline: ['Baseline compiled', 1 << 14],
	kTopmostFrameIsInterpreted: ['Topmost frame is Interpreted', 1 << 15],
	kTopmostFrameIsBaseline: ['Topmost frame is Baseline', 1 << 16],
	kIsLazy: ['Lazy function', 1 << 17],
	kTopmostFrameIsMaglev: ['Topmost frame is Maglev', 1 << 18],
	kOptimizeOnNextCallOptimizesToMaglev: ['Will optimize to Maglev on next call', 1 << 19],
	kOptimizeMaglevOptimizesToTurbofan: ['Maglev will optimize to Turbofan', 1 << 20],
	kMarkedForMaglevOptimization: ['Marked for Maglev optimization', 1 << 21],
	kMarkedForConcurrentMaglevOptimization: ['Marked for concurrent Maglev optimization', 1 << 22],
};

const runOptStatus = (fn, args = {}, name = fn.name || '<anonymous>') => {
	
    // %PrepareFunctionForOptimization(fn);
    // typeof fn === 'function' ? fn(args) : fn;
    // %OptimizeFunctionOnNextCall(fn);
    // typeof fn === 'function' ? fn(args) : fn;

    const s = %GetOptimizationStatus(fn);
	console.log(`${logDelimiters.runOptStatus.start}: ${name}`);
	const flags = Object.values(OptimizationStatus)
		.filter(([_, bit]) => s & bit)
		.map(([label]) => label);

	console.log(`${logs.runOptStatus}: Name: ${name} Flags: ${flags.length ? flags.join(', ') : 'No flags set'}`);
	console.log(`${logDelimiters.runOptStatus.end}: ${name}`);
}

export default runOptStatus