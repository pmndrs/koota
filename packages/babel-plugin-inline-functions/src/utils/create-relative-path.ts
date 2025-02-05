export function createRelativePath(fromPath: string, toPath: string): string {
	// Normalize paths to use forward slashes
	fromPath = fromPath.replace(/\\/g, '/');
	toPath = toPath.replace(/\\/g, '/');
	// Split paths into segments
	const fromParts = fromPath.split('/');
	const toParts = toPath.split('/');

	// Remove the file names
	fromParts.pop();
	const toFile = toParts.pop() || '';

	// Find common path segments
	let commonLength = 0;
	const minLength = Math.min(fromParts.length, toParts.length);

	while (commonLength < minLength && fromParts[commonLength] === toParts[commonLength]) {
		commonLength++;
	}

	// Build the relative path
	const pathParts: string[] = [];

	// Add "../" for each level we need to go up
	for (let i = commonLength; i < fromParts.length; i++) {
		pathParts.push('..');
	}

	// Add the path down to the target
	pathParts.push(...toParts.slice(commonLength));

	// Join everything together with the target file (without extension)
	let newPath = [...pathParts, toFile.replace(/\.(js|ts|jsx|tsx)$/, '')].join('/');

	// Ensure it starts with ./ if it's not going up directories
	if (!newPath.startsWith('.')) {
		newPath = './' + newPath;
	}

	return newPath;
}

export function createRelativePathWithRelativePath(toPath: string, relativePath: string) {
	// Normalize paths to use forward slashes
	toPath = toPath.replace(/\\/g, '/');
	relativePath = relativePath.replace(/\\/g, '/');

	// If relativePath is in the same directory (starts with './'), return toPath as-is
	if (relativePath.startsWith('./')) {
		return toPath;
	}

	// Otherwise, calculate the relative path
	const relativeDir = relativePath.split('/').slice(0, -1).join('/');
	const toParts = toPath.split('/');
	const toFile = toParts.pop() || '';
	const relativeParts = relativeDir.split('/');

	// Find common path segments
	let commonLength = 0;
	const minLength = Math.min(relativeParts.length, toParts.length);

	while (commonLength < minLength && relativeParts[commonLength] === toParts[commonLength]) {
		commonLength++;
	}

	// Build the relative path
	const pathParts: string[] = [];

	// Add "../" for each level we need to go up
	for (let i = commonLength; i < relativeParts.length; i++) {
		pathParts.push('..');
	}

	// Add the path down to the target
	pathParts.push(...toParts.slice(commonLength));

	// Join everything together with the target file
	let newPath = [...pathParts, toFile].join('/');

	// Ensure it starts with ./ if it's not going up directories
	if (!newPath.startsWith('.')) {
		newPath = './' + newPath;
	}

	return newPath;
}
