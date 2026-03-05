/**
 * Feature Detection — Algorithmic detection of features in laser profiles.
 * 
 * This module identifies "features" (protrusions, anomalies) in the laser profile
 * by analyzing deviations from a local baseline (the smoothed profile).
 */

/**
 * @typedef {Object} DetectedFeature
 * @property {string} type - Feature type (e.g., 'Anode', 'Grout Bag', 'Anomaly')
 * @property {number} confidence - 0.0 to 1.0 confidence level
 * @property {number} xMin - Left boundary (mm)
 * @property {number} xMax - Right boundary (mm)
 * @property {number} zMin - Top boundary (mm - shallowest)
 * @property {number} zMax - Bottom boundary (mm - deepest)
 * @property {number[]} indices - Indices of points within the feature
 */

/**
 * Detect features: Freespan, Anodes, and Rocks based on profile geometry.
 * 
 * @param {{ x: number, z: number, y: number }[]} points 3D points
 * @param {object} options
 * @param {number} [options.minHeight=15] Minimum protrusion height (mm)
 * @param {number} [options.minWidth=20] Minimum protrusion width (mm)
 * @param {object} [options.pipeResult] Current pipe detection result
 * @returns {DetectedFeature[]}
 */
export function detectFeatures(points, options = {}) {
    if (points.length < 10) return [];

    const {
        minHeight = 15,
        minWidth = 20,
        pipeResult = null
    } = options;

    const detected = [];
    if (!pipeResult) return []; // Require pipe detection for these specific features

    // 1. Anode Detection (Protrusions on top of the pipe)
    const anodeIndices = [];
    const pipePoints = [];
    const pipeXMin = pipeResult.cx - pipeResult.radius * 0.95;
    const pipeXMax = pipeResult.cx + pipeResult.radius * 0.95;

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.x >= pipeXMin && p.x <= pipeXMax) {
            // Expected Z on the top of the fitted circle
            const dx = p.x - pipeResult.cx;
            const expectedZ = pipeResult.cz - Math.sqrt(Math.max(0, pipeResult.radius ** 2 - dx ** 2));

            // If point is significantly shallower (smaller Z) than the pipe wall
            const deviation = expectedZ - p.z;
            if (deviation > 5 && deviation < 150) { // 5mm threshold for anodes
                anodeIndices.push(i);
            }
        }
    }

    // Group contiguous anode points
    if (anodeIndices.length >= 3) {
        groupAndAddFeatures(anodeIndices, points, 'Anode', 0.8, detected);
    }

    // 2. Rock Detection (Deviations on the seabed)
    const rockIndices = [];
    const baselineWindow = 50;

    // Divide points into Left-of-pipe and Right-of-pipe
    const leftSeabed = [];
    const rightSeabed = [];
    const pipeOuterXMin = pipeResult.cx - pipeResult.radius * 1.2;
    const pipeOuterXMax = pipeResult.cx + pipeResult.radius * 1.2;

    for (let i = 0; i < points.length; i++) {
        if (points[i].x < pipeOuterXMin) leftSeabed.push(i);
        else if (points[i].x > pipeOuterXMax) rightSeabed.push(i);
    }

    const processSeabed = (indices) => {
        if (indices.length < 5) return;
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const start = Math.max(0, i - baselineWindow);
            const end = Math.min(indices.length - 1, i + baselineWindow);

            let localMaxZ = -Infinity;
            for (let j = start; j <= end; j++) {
                if (points[indices[j]].z > localMaxZ) localMaxZ = points[indices[j]].z;
            }

            const deviation = localMaxZ - points[idx].z;
            if (deviation > minHeight) rockIndices.push(idx);
        }
    };

    processSeabed(leftSeabed);
    processSeabed(rightSeabed);

    if (rockIndices.length >= 3) {
        groupAndAddFeatures(rockIndices, points, 'Rock', 0.7, detected);
    }

    // 3. Freespan Detection (Gap between pipe and seabed)
    // Estimate seabed depth near the pipe
    let seabedDepthSum = 0, count = 0;
    for (const i of [...leftSeabed.slice(-20), ...rightSeabed.slice(0, 20)]) {
        seabedDepthSum += points[i].z;
        count++;
    }

    if (count > 5) {
        const avgSeabedZ = seabedDepthSum / count;
        const pipeBottomZ = pipeResult.cz + pipeResult.radius;
        const gap = avgSeabedZ - pipeBottomZ;

        if (gap > 20) { // 20mm gap threshold for Freespan
            detected.push({
                type: 'Freespan',
                confidence: Math.min(1.0, 0.5 + gap / 200),
                xMin: pipeResult.cx - pipeResult.radius,
                xMax: pipeResult.cx + pipeResult.radius,
                zMin: pipeBottomZ,
                zMax: avgSeabedZ,
                indices: [] // Virtual feature, no specific points
            });
        }
    }

    return detected;
}

function groupAndAddFeatures(indices, points, type, baseConf, results) {
    let currentGroup = [];
    for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        if (currentGroup.length === 0 || idx === indices[i - 1] + 1 || (idx - indices[i - 1] < 5)) {
            currentGroup.push(idx);
        } else {
            addFeatureFromGroup(currentGroup, points, type, baseConf, results);
            currentGroup = [idx];
        }
    }
    if (currentGroup.length > 0) {
        addFeatureFromGroup(currentGroup, points, type, baseConf, results);
    }
}

function addFeatureFromGroup(indices, points, type, baseConf, results) {
    if (indices.length < 5) return;

    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const idx of indices) {
        const p = points[idx];
        if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
        if (p.z < zMin) zMin = p.z; if (p.z > zMax) zMax = p.z;
    }

    const width = xMax - xMin;
    if (width < 5) return;

    results.push({
        type,
        confidence: baseConf,
        xMin, xMax, zMin, zMax,
        indices: [...indices]
    });
}
