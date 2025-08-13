/**
 * Compare the size of two version numbers.
 *
 * @param {string} v1 First version number (e.g. "1.2.3")
 * @param {string} v2 Second version number (e.g. "1.3.0")
 * @returns {number}
 * - 1: if v1 > v2
 * - -1: if v1 < v2
 * - 0: if v1 === v2
 */
export function compareVersions(v1, v2) {
    if (typeof v1 !== "string" || typeof v2 !== "string") {
        // Or throw an error, depending on how you want to handle invalid input
        return 0;
    }

    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);
    const len = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < len; i++) {
        // If a version number part doesn't exist, treat it as 0
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;

        if (isNaN(p1) || isNaN(p2)) {
            // Handle non-numeric parts, e.g. "1.2.a" vs "1.2.b"
            // In this case, we might still want to return 0 or handle according to requirements
            return 0;
        }

        if (p1 > p2) {
            return 1;
        }
        if (p1 < p2) {
            return -1;
        }
    }

    return 0;
}
