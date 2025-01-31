const inlinedFunctionCount = new Map<string, number>();
const transformedFunctions = new Set<string>();

export function getInlinedFunctionCount(name: string) {
	return inlinedFunctionCount.get(name) ?? 0;
}

export function getAllInlinedFunctionCounts() {
	return inlinedFunctionCount.entries();
}

export function incrementInlinedFunctionCount(name: string) {
	inlinedFunctionCount.set(name, (inlinedFunctionCount.get(name) ?? 0) + 1);
}

export function setTransformedFunction(name: string) {
	transformedFunctions.add(name);
}

export function getAllTransformedFunctions() {
	return Array.from(transformedFunctions);
}
