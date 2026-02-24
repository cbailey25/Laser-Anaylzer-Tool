/**
 * Pipe Fitting — Circle Detection via Least-Squares (Kåsa Method)
 *
 * Fits a circle to a set of 2D points (X, Z) representing a laser profile
 * cross-section, then filters by expected pipe diameter.
 */

/**
 * Fit a circle to a set of (x, z) points using the algebraic Kåsa method.
 *
 * Minimises Σ (x² + z² + D*x + E*z + F)² via linear least squares.
 * Circle: centre = (-D/2, -E/2), radius = √((D²+E²)/4 - F)
 *
 * @param {{ x: number, z: number }[]} points
 * @returns {{ cx: number, cz: number, radius: number, rms: number } | null}
 */
export function fitCircle(points) {
    const n = points.length;
    if (n < 3) return null;

    // Build normal equations for [D, E, F]
    let Sx = 0, Sz = 0, Sx2 = 0, Sz2 = 0, Sxz = 0;
    let Sx3 = 0, Sz3 = 0, Sx2z = 0, Sxz2 = 0;

    for (const p of points) {
        const x = p.x, z = p.z;
        const x2 = x * x, z2 = z * z;
        Sx += x; Sz += z;
        Sx2 += x2; Sz2 += z2;
        Sxz += x * z;
        Sx3 += x2 * x; Sz3 += z2 * z;
        Sx2z += x2 * z; Sxz2 += x * z2;
    }

    // Matrix A * [D, E, F]^T = b
    // A = [[Sx2, Sxz, Sx],
    //      [Sxz, Sz2, Sz],
    //      [Sx,  Sz,  n ]]
    // b = [-(Sx3 + Sxz2), -(Sx2z + Sz3), -(Sx2 + Sz2)]

    const A = [
        [Sx2, Sxz, Sx],
        [Sxz, Sz2, Sz],
        [Sx, Sz, n]
    ];
    const b = [
        -(Sx3 + Sxz2),
        -(Sx2z + Sz3),
        -(Sx2 + Sz2)
    ];

    // Solve 3x3 system via Cramer's rule
    const det3 = (m) =>
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

    const detA = det3(A);
    if (Math.abs(detA) < 1e-12) return null;

    const replaceCol = (mat, col, vec) =>
        mat.map((row, i) => row.map((val, j) => (j === col ? vec[i] : val)));

    const D = det3(replaceCol(A, 0, b)) / detA;
    const E = det3(replaceCol(A, 1, b)) / detA;
    const F = det3(replaceCol(A, 2, b)) / detA;

    const cx = -D / 2;
    const cz = -E / 2;
    const rSquared = (D * D + E * E) / 4 - F;
    if (rSquared <= 0) return null;
    const radius = Math.sqrt(rSquared);

    // Compute RMS residual
    let sumSqRes = 0;
    for (const p of points) {
        const dist = Math.sqrt((p.x - cx) ** 2 + (p.z - cz) ** 2);
        sumSqRes += (dist - radius) ** 2;
    }
    const rms = Math.sqrt(sumSqRes / n);

    return { cx, cz, radius, rms };
}


/**
 * Detect a pipe profile in the laser line using a robust RANSAC approach.
 * 
 * Strategy:
 *   1. Define a search region (around prevResult or global peak).
 *   2. Use RANSAC:
 *      - Randomly sample 3 points to define a candidate circle.
 *      - Validate radius against expectedDiameter.
 *      - Count inliers (points within tolerance distance of the circle boundary).
 *   3. Pick the candidate with the most inliers.
 *   4. Refine the fit using all inliers from the best candidate.
 *
 * @param {{ x: number, z: number }[]} points         3D profile points
 * @param {number}                      expectedDiameter Expected pipe diameter (mm)
 * @param {object}                      [options]       Detection options
 * @param {object}                      [options.prevResult] Last successful detection (for tracking)
 * @param {number}                      [options.tolerance=10] Inlier distance tolerance (mm)
 * @returns {{ cx: number, cz: number, radius: number, rms: number, inlierStart: number, inlierEnd: number, diameter: number } | null}
 */
export function detectPipe(points, expectedDiameter, options = {}) {
    if (points.length < 15) return null;

    const { prevResult = null, tolerance = 8 } = options;
    const expectedRadius = expectedDiameter / 2;
    const radTol = expectedRadius * 0.25;

    // 1. Identify candidate points (the search window)
    let searchIndices = [];
    if (prevResult && prevResult.cx !== undefined) {
        // Look within ±1.5 radius of previous center
        const xMin = prevResult.cx - expectedRadius * 1.5;
        const xMax = prevResult.cx + expectedRadius * 1.5;
        for (let i = 0; i < points.length; i++) {
            if (points[i].x >= xMin && points[i].x <= xMax) searchIndices.push(i);
        }
    }

    // Fallback/Expand: If search indices are too few, or no prev result, use most of the profile
    if (searchIndices.length < 20) {
        searchIndices = points.map((_, i) => i);
    }

    // 2. RANSAC Loop
    let bestInliers = [];
    let bestCircle = null;
    const iterations = 100;

    for (let iter = 0; iter < iterations; iter++) {
        // Randomly pick 3 indices
        const idx1 = searchIndices[Math.floor(Math.random() * searchIndices.length)];
        const idx2 = searchIndices[Math.floor(Math.random() * searchIndices.length)];
        const idx3 = searchIndices[Math.floor(Math.random() * searchIndices.length)];
        if (idx1 === idx2 || idx2 === idx3 || idx1 === idx3) continue;

        const p1 = points[idx1], p2 = points[idx2], p3 = points[idx3];

        // Geometric circle from 3 points
        const circle = getCircleFrom3Points(p1, p2, p3);
        if (!circle) continue;

        // Constraint: Radius must be reasonably close to expected
        if (Math.abs(circle.radius - expectedRadius) > radTol) continue;

        // Constraint: Center must be "below" the points (larger Z)
        if (circle.cz < p1.z && circle.cz < p2.z && circle.cz < p3.z) continue;

        // Count inliers
        const inliers = [];
        for (const idx of searchIndices) {
            const p = points[idx];
            const dist = Math.sqrt((p.x - circle.cx) ** 2 + (p.z - circle.cz) ** 2);
            if (Math.abs(dist - circle.radius) < tolerance) {
                inliers.push(idx);
            }
        }

        if (inliers.length > bestInliers.length) {
            bestInliers = inliers;
            bestCircle = circle;
        }
    }

    if (!bestCircle || bestInliers.length < 15) return null;

    // 3. Final Refinement: Fit to all inliers
    const inlierPoints = bestInliers.map(i => points[i]);
    const refined = fitCircle(inlierPoints);
    if (!refined) return null;

    // Determine the span of the inliers for visualization
    const startIdx = Math.min(...bestInliers);
    const endIdx = Math.max(...bestInliers);

    return {
        cx: refined.cx,
        cz: refined.cz,
        radius: refined.radius,
        rms: refined.rms,
        diameter: refined.radius * 2,
        inlierStart: startIdx,
        inlierEnd: endIdx
    };
}

/**
 * Geometric circle from 3 points
 */
function getCircleFrom3Points(p1, p2, p3) {
    const x1 = p1.x, y1 = p1.z;
    const x2 = p2.x, y2 = p2.z;
    const x3 = p3.x, y3 = p3.z;

    const b = x2 - x1, c = y2 - y1;
    const d = x3 - x1, e = y3 - y1;
    const f = (x2 * x2 - x1 * x1 + y2 * y2 - y1 * y1);
    const g = (x3 * x3 - x1 * x1 + y3 * y3 - y1 * y1);
    const det = 2 * (b * e - c * d);

    if (Math.abs(det) < 1e-6) return null;

    const cx = (e * f - c * g) / det;
    const cz = (b * g - d * f) / det;
    const radius = Math.sqrt((x1 - cx) ** 2 + (y1 - cz) ** 2);

    return { cx, cz, radius };
}
