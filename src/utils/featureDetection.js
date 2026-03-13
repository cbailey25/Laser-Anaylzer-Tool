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
 * @param {object} [options.tfModel] Optional TensorFlow.js model
 * @returns {DetectedFeature[]}
 */
export async function detectFeatures(points, options = {}) {
    if (points.length < 10) return [];

    const {
        minHeight = 15,
        minWidth = 20,
        pipeResult = null,
        tfModel = null
    } = options;

    const detected = [];
    if (!pipeResult) return []; // Require pipe detection for these specific features

    // 1. Anode Detection (Heuristic seeding)
    const anodeIndices = [];
    const pipeXMin = pipeResult.cx - pipeResult.radius * 0.95;
    const pipeXMax = pipeResult.cx + pipeResult.radius * 0.95;

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.x >= pipeXMin && p.x <= pipeXMax) {
            const dx = p.x - pipeResult.cx;
            const expectedZ = pipeResult.cz - Math.sqrt(Math.max(0, pipeResult.radius ** 2 - dx ** 2));
            const deviation = expectedZ - p.z;
            if (deviation > 5) anodeIndices.push(i);
        }
    }

    if (anodeIndices.length >= 3) {
        await groupAndAddFeatures(anodeIndices, points, 'Anode', 0.8, detected, tfModel, 'on-pipe', pipeResult);
    }

    // 2. Rock Detection (Heuristic seeding)
    const rockIndices = [];
    const pipeOuterXMin = pipeResult.cx - pipeResult.radius * 1.2;
    const pipeOuterXMax = pipeResult.cx + pipeResult.radius * 1.2;

    const leftSeabed = [], rightSeabed = [];
    for (let i = 0; i < points.length; i++) {
        if (points[i].x < pipeOuterXMin) leftSeabed.push(i);
        else if (points[i].x > pipeOuterXMax) rightSeabed.push(i);
    }

    const processSeabed = (indices) => {
        if (indices.length < 5) return;
        const baselineWindow = 30;
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const start = Math.max(0, i - baselineWindow);
            const end = Math.min(indices.length - 1, i + baselineWindow);
            let localMaxZ = -Infinity;
            for (let j = start; j <= end; j++) {
                if (points[indices[j]].z > localMaxZ) localMaxZ = points[indices[j]].z;
            }
            if (localMaxZ - points[idx].z > minHeight) rockIndices.push(idx);
        }
    };

    processSeabed(leftSeabed);
    processSeabed(rightSeabed);

    if (rockIndices.length >= 3) {
        await groupAndAddFeatures(rockIndices, points, 'Rock', 0.7, detected, tfModel, 'off-pipe', pipeResult);
    }

    // 3. Freespan Detection
    let seabedDepthSum = 0, count = 0;
    for (const i of [...leftSeabed.slice(-20), ...rightSeabed.slice(0, 20)]) {
        seabedDepthSum += points[i].z;
        count++;
    }

    if (count > 5) {
        const avgSeabedZ = seabedDepthSum / count;
        const pipeBottomZ = pipeResult.cz + pipeResult.radius;
        const gap = avgSeabedZ - pipeBottomZ;

        if (gap > 20) {
            detected.push({
                type: 'Freespan',
                confidence: Math.min(1.0, 0.5 + gap / 200),
                xMin: pipeResult.cx - pipeResult.radius,
                xMax: pipeResult.cx + pipeResult.radius,
                zMin: pipeBottomZ,
                zMax: avgSeabedZ,
                indices: []
            });
        }
    }

    return detected;
}

async function groupAndAddFeatures(indices, points, type, baseConf, results, model = null, locationContext = 'unknown', pipeResult = null) {
    let currentGroup = [];
    for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        if (currentGroup.length === 0 || idx === indices[i - 1] + 1 || (idx - indices[i - 1] < 5)) {
            currentGroup.push(idx);
        } else {
            await addFeatureFromGroup(currentGroup, points, type, baseConf, results, model, locationContext, pipeResult);
            currentGroup = [idx];
        }
    }
    if (currentGroup.length > 0) {
        await addFeatureFromGroup(currentGroup, points, type, baseConf, results, model, locationContext, pipeResult);
    }
}

/**
 * REFINED: Add feature from group with optional ML classification and spatial validation.
 */
async function addFeatureFromGroup(indices, points, type, baseConf, results, model = null, locationContext = 'unknown', pipeResult = null) {
    if (indices.length < 5) return;

    let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    const featurePoints = [];

    for (const idx of indices) {
        const p = points[idx];
        featurePoints.push(p);
        if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
        if (p.z < zMin) zMin = p.z; if (p.z > zMax) zMax = p.z;
    }

    const width = xMax - xMin;
    if (width < 5) return;

    let finalType = type;
    let finalConf = baseConf;
    let mlDetails = null;

    // ----- MODEL INTEGRATION HOOK WITH SPATIAL VALIDATION -----
    if (model) {
        const mlResult = await classifyWithML(featurePoints, model, points, indices, pipeResult);
        if (mlResult) {
            // Check for Physical Impossibility:
            // 1. Anodes cannot be off the pipe
            // 2. Rocks cannot be on the pipe
            const isInvalidLocation =
                (mlResult.type === 'Anode' && locationContext === 'off-pipe') ||
                (mlResult.type === 'Rock' && locationContext === 'on-pipe');

            if (isInvalidLocation) {
                console.warn(`[ML] Rejected impossible class: AI thought ${mlResult.type} but location is ${locationContext}. Reverting to heuristic: ${type}`);
                mlDetails = `AI: ${mlResult.type} (REJECTED - wrong location)`;
                // Stick with heuristic type
            } else {
                const agreement = mlResult.type === type ? "AGREE" : "DISAGREE";
                mlDetails = `AI: ${mlResult.type} (${Math.round(mlResult.confidence * 100)}%) - ${agreement}`;
                console.log(`[ML] Feature at X:${Math.round(xMin)} verified. Heuristic: ${type} vs AI: ${mlResult.type}. Conf: ${Math.round(mlResult.confidence * 100)}%`);

                finalType = mlResult.type;
                finalConf = mlResult.confidence;
            }
        }
    }

    results.push({
        type: finalType,
        confidence: finalConf,
        xMin, xMax, zMin, zMax,
        indices: [...indices],
        mlConfirmed: mlDetails?.includes("AGREE"),
        mlDetails: mlDetails
    });
}

/**
 * REFINED: Classification logic with context and spatial features.
 * Vector structure: [64 pts feature (128)] + [10 pts left (20)] + [10 pts right (20)] + [pipe dist (1)] = 169
 */
async function classifyWithML(featurePoints, model, allPoints, featureIndices, pipeResult) {
    try {
        const tf = window.tf;
        if (!tf) return null;

        // --- 1. FEATURE NORMALIZATION ---
        const xs = featurePoints.map(p => p.x);
        const zs = featurePoints.map(p => p.z);
        const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
        const zMean = zs.reduce((a, b) => a + b, 0) / zs.length;

        const centeredX = xs.map(x => x - xMean);
        const centeredZ = zs.map(z => z - zMean);

        const maxDim = Math.max(...centeredX.map(Math.abs), ...centeredZ.map(Math.abs), 1.0);
        const normalizedX = centeredX.map(x => x / maxDim);
        const normalizedZ = centeredZ.map(z => z / maxDim);

        // Resample feature to 64 points
        const targetLen = 64;
        const featResampled = [];
        for (let i = 0; i < targetLen; i++) {
            const pos = (i / (targetLen - 1)) * (normalizedX.length - 1);
            const idx = Math.floor(pos);
            const frac = pos - idx;

            if (idx >= normalizedX.length - 1) {
                featResampled.push(normalizedX[idx], normalizedZ[idx]);
            } else {
                featResampled.push(
                    normalizedX[idx] + frac * (normalizedX[idx + 1] - normalizedX[idx]),
                    normalizedZ[idx] + frac * (normalizedZ[idx + 1] - normalizedZ[idx])
                );
            }
        }

        // --- 2. EXTRACT CONTEXT (Neighbors) ---
        const nContext = 10;
        const leftVec = new Array(nContext * 2).fill(0);
        const rightVec = new Array(nContext * 2).fill(0);

        if (featureIndices && allPoints) {
            const startIdx = featureIndices[0];
            const endIdx = featureIndices[featureIndices.length - 1];

            // Left
            let lCount = 0;
            for (let i = Math.max(0, startIdx - nContext); i < startIdx; i++) {
                leftVec[lCount * 2] = (allPoints[i].x - xMean) / maxDim;
                leftVec[lCount * 2 + 1] = (allPoints[i].z - zMean) / maxDim;
                lCount++;
            }

            // Right
            let rCount = 0;
            for (let i = endIdx + 1; i < Math.min(allPoints.length, endIdx + 1 + nContext); i++) {
                rightVec[rCount * 2] = (allPoints[i].x - xMean) / maxDim;
                rightVec[rCount * 2 + 1] = (allPoints[i].z - zMean) / maxDim;
                rCount++;
            }
        }

        // --- 3. RADIAL PIPE DISTANCE ---
        let radialDist = 1.0; // Default to "far"
        if (pipeResult && pipeResult.cx !== undefined) {
            const dist = Math.sqrt((xMean - pipeResult.cx) ** 2 + (zMean - pipeResult.cz) ** 2);
            const radius = pipeResult.radius || 250;
            radialDist = (dist - radius) / radius;
        }

        // Combine into 169-feature vector
        const finalVector = [...featResampled, ...leftVec, ...rightVec, radialDist];

        // 3. Inference
        const inputTensor = tf.tensor2d([finalVector]);
        const prediction = model.predict(inputTensor);
        const scores = await prediction.data();
        inputTensor.dispose();
        prediction.dispose();

        // Map labels (0: Anode, 1: Rock, 2: Freespan)
        const labels = ['Anode', 'Rock', 'Freespan'];
        const topIdx = scores.indexOf(Math.max(...scores));

        return {
            type: labels[topIdx],
            confidence: scores[topIdx]
        };
    } catch (e) {
        console.error('ML Inference failed:', e);
        return null;
    }
}
