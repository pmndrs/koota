export function randomSphericalDirection(magnitude = 1) {
	const theta = Math.random() * Math.PI * 2;
	const u = Math.random() * 2 - 1;
	const c = Math.sqrt(1 - u * u);

	return {
		x: c * Math.cos(theta) * magnitude,
		y: u * magnitude,
		z: c * Math.sin(theta) * magnitude,
	};
}
