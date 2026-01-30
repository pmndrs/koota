/**
 * Convert RGB values to hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => {
        const clamped = Math.max(0, Math.min(255, Math.round(n)));
        return clamped.toString(16).padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert hex string to RGB object.
 * Returns default color if hex is invalid.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const defaultColor = { r: 74, g: 144, b: 217 };

    // Remove # if present
    const cleaned = hex.replace(/^#/, '');

    // Validate hex format
    if (!/^[0-9a-fA-F]{6}$/.test(cleaned) && !/^[0-9a-fA-F]{3}$/.test(cleaned)) {
        return defaultColor;
    }

    // Expand shorthand (e.g., "abc" -> "aabbcc")
    const full = cleaned.length === 3 ? cleaned.replace(/./g, '$&$&') : cleaned;

    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);

    if (isNaN(r) || isNaN(g) || isNaN(b)) {
        return defaultColor;
    }

    return { r, g, b };
}
