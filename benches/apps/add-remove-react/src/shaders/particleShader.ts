export function fragmentShader() {
	return `
		varying vec4 vColor;
		void main() {
			float distanceFromCenter = length(gl_PointCoord - vec2(0.5, 0.5));
			if (distanceFromCenter > 0.5) {
				discard;
			}
			gl_FragColor = vec4( vColor );
		}
	`;
}

export function vertexShader() {
	return `
		attribute float size;
		attribute vec4 color;
		varying vec4 vColor;
		void main() {
			vColor = color;
			vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
			gl_PointSize = size * ( 250.0 / -mvPosition.z );
			gl_Position = projectionMatrix * mvPosition;
		}
	`;
}
