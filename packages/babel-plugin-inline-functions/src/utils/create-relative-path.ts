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
	let relativePath = [...pathParts, toFile.replace(/\.(js|ts|jsx|tsx)$/, '')].join('/');

	// Ensure it starts with ./ if it's not going up directories
	if (!relativePath.startsWith('.')) {
		relativePath = './' + relativePath;
	}

	return relativePath;
}
