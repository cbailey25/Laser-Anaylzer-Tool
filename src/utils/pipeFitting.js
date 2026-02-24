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
 * Detect a pipe profile in the laser line using iterative RANSAC-like approach.
 * 
 * Strategy:
 *   1. Find the "peak" region (points closest to the camera, i.e. smallest Z)
 *   2. Grow region outward from peak while residual to circle fit stays small
 *   3. Validate fitted circle against expected diameter
 *
 * @param {{ x: number, z: number }[]} points         3D profile points
 * @param {number}                      expectedDiameter Expected pipe diameter (mm)
 * @param {number}                      tolerance       Radius tolerance fraction (default 0.25 = ±25%)
 * @returns {{ cx: number, cz: number, radius: number, rms: number, inlierStart: number, inlierEnd: number, diameter: number } | null}
 */
export function detectPipe(points, expectedDiameter, tolerance = 0.25) {
    if (points.length < 10) return null;

    const expectedRadius = expectedDiameter / 2;

    // Step 1: Find the point with minimum Z (closest to camera = top of pipe)
    let minZ = Infinity;
    let minIdx = 0;
    for (let i = 0; i < points.length; i++) {
        if (points[i].z < minZ) {
            minZ = points[i].z;
            minIdx = i;
        }
    }

    // Step 2: Expand a window around the peak and try circle fitting
    let bestFit = null;
    let bestScore = Infinity;
    let bestStart = 0, bestEnd = 0;

    // Try different window sizes around the peak
    for (let halfWin = 5; halfWin < Math.floor(points.length / 2); halfWin += 2) {
        const start = Math.max(0, minIdx - halfWin);
        const end = Math.min(points.length - 1, minIdx + halfWin);
        const subset = points.slice(start, end + 1);

        if (subset.length < 8) continue;

        const fit = fitCircle(subset);
        if (!fit) continue;

        // Check if radius matches expected
        const radiusError = Math.abs(fit.radius - expectedRadius) / expectedRadius;
        if (radiusError > tolerance) continue;

        // Score: prefer low RMS and radius close to expected
        const score = fit.rms + radiusError * expectedRadius * 0.5;
        if (score < bestScore) {
            bestScore = score;
            bestFit = fit;
            bestStart = start;
            bestEnd = end;
        }
    }

    if (!bestFit) return null;

    return {
        cx: bestFit.cx,
        cz: bestFit.cz,
        radius: bestFit.radius,
        rms: bestFit.rms,
        diameter: bestFit.radius * 2,
        inlierStart: bestStart,
        inlierEnd: bestEnd
    };
}
