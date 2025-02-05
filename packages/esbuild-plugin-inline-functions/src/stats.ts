const inlinedFunctionCount = new Map<string, number>();
const transformedFunctions = new Map<string, { isPure: boolean }>();

function getInlinedFunctionCount(name: string) {
	return inlinedFunctionCount.get(name) ?? 0;
}

function getAllInlinedFunctionCounts() {
	return inlinedFunctionCount.entries();
}

function incrementInlinedFunctionCount(name: string) {
	inlinedFunctionCount.set(name, (inlinedFunctionCount.get(name) ?? 0) + 1);
}

function setTransformedFunction(name: string, isPure: boolean) {
	transformedFunctions.set(name, { isPure });
}

function getAllTransformedFunctions() {
	return Array.from(transformedFunctions);
}

function reset() {
	inlinedFunctionCount.clear();
	transformedFunctions.clear();
}

export const STATS = {
	getInlinedFunctionCount,
	getAllInlinedFunctionCounts,
	incrementInlinedFunctionCount,
	setTransformedFunction,
	getAllTransformedFunctions,
	reset,
};
