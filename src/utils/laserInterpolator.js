/**
 * Enhanced Laser Profile Interpolation for Processed Data
 * 
 * When laser files contain reduced point counts (e.g., 8 instead of 2048),
 * we need intelligent interpolation to reconstruct the full profile.
 */

/**
 * Interpolate sparse laser points using spline interpolation for smooth curves
 * 
 * @param {Array} points - Array of laser points with {column, yOffset, intensity, width, valid}
 * @param {number} targetResolution - Target number of points (e.g., 2048)
 * @param {number} imageWidth - Actual image width in pixels
 * @returns {Array} - Interpolated points array
 */
export function interpolateLaserProfile(points, targetResolution = 2048, imageWidth = 2048) {
    if (!points || points.length === 0) {
        return [];
    }
    
    // Filter valid points
    const validPoints = points.filter(p => p.valid);
    if (validPoints.length === 0) {
        return [];
    }
    
    // Sort points by column
    validPoints.sort((a, b) => a.column - b.column);
    
    // Scale points to full resolution
    const scaleFactor = targetResolution / Math.max(...validPoints.map(p => p.column));
    const scaledPoints = validPoints.map(p => ({
        ...p,
        column: Math.round(p.column * scaleFactor),
        yOffset: p.yOffset
    }));
    
    // Create interpolated profile
    const interpolated = new Array(targetResolution);
    
    // Place actual points
    scaledPoints.forEach(p => {
        if (p.column >= 0 && p.column < targetResolution) {
            interpolated[p.column] = p;
        }
    });
    
    // Interpolate between points using cubic spline for smoothness
    for (let i = 0; i < scaledPoints.length - 1; i++) {
        const p1 = scaledPoints[i];
        const p2 = scaledPoints[i + 1];
        
        const startCol = Math.max(0, p1.column);
        const endCol = Math.min(targetResolution - 1, p2.column);
        
        if (endCol - startCol > 1) {
            for (let col = startCol + 1; col < endCol; col++) {
                const t = (col - p1.column) / (p2.column - p1.column);
                
                // Cubic interpolation for smoother curves
                const t2 = t * t;
                const t3 = t2 * t;
                
                // Hermite spline coefficients
                const h00 = 2 * t3 - 3 * t2 + 1;
                const h10 = t3 - 2 * t2 + t;
                const h01 = -2 * t3 + 3 * t2;
                const h11 = t3 - t2;
                
                // Simple tangent estimation
                const m1 = i > 0 ? (p2.yOffset - points[i - 1].yOffset) / 2 : 0;
                const m2 = i < scaledPoints.length - 2 ? (points[i + 2].yOffset - p1.yOffset) / 2 : 0;
                
                const yOffset = h00 * p1.yOffset + h10 * m1 + h01 * p2.yOffset + h11 * m2;
                const intensity = Math.round(p1.intensity + t * (p2.intensity - p1.intensity));
                const width = Math.round(p1.width + t * (p2.width - p1.width));
                
                interpolated[col] = {
                    column: col,
                    yOffset,
                    intensity: Math.max(0, Math.min(255, intensity)),
                    width: Math.max(0, Math.min(255, width)),
                    valid: width > 0
                };
            }
        }
    }
    
    // Extrapolate to edges
    extrapolateEdges(interpolated, scaledPoints, targetResolution);
    
    return interpolated;
}

/**
 * Extrapolate values to the edges of the sensor
 */
function extrapolateEdges(interpolated, points, targetResolution) {
    if (points.length === 0) return;
    
    // Extrapolate to left edge
    const firstPoint = points[0];
    for (let col = 0; col < firstPoint.column && col < targetResolution; col++) {
        if (!interpolated[col]) {
            interpolated[col] = {
                column: col,
                yOffset: firstPoint.yOffset,
                intensity: firstPoint.intensity,
                width: firstPoint.width,
                valid: firstPoint.valid
            };
        }
    }
    
    // Extrapolate to right edge
    const lastPoint = points[points.length - 1];
    for (let col = lastPoint.column + 1; col < targetResolution; col++) {
        if (!interpolated[col]) {
            interpolated[col] = {
                column: col,
                yOffset: lastPoint.yOffset,
                intensity: lastPoint.intensity,
                width: lastPoint.width,
                valid: lastPoint.valid
            };
        }
    }
}

/**
 * Create a realistic laser profile from sparse points
 * Uses Gaussian interpolation for natural-looking laser lines
 */
export function createRealisticLaserProfile(points, targetResolution = 2048) {
    const validPoints = points.filter(p => p.valid);
    if (validPoints.length === 0) return [];
    
    const result = new Array(targetResolution);
    const sigma = targetResolution / (validPoints.length * 4); // Adaptive sigma
    
    for (let col = 0; col < targetResolution; col++) {
        let weightedY = 0;
        let weightedIntensity = 0;
        let weightedWidth = 0;
        let totalWeight = 0;
        
        for (const point of validPoints) {
            const scaledCol = Math.round(point.column * targetResolution / Math.max(...validPoints.map(p => p.column)));
            const distance = Math.abs(col - scaledCol);
            const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
            
            weightedY += point.yOffset * weight;
            weightedIntensity += point.intensity * weight;
            weightedWidth += point.width * weight;
            totalWeight += weight;
        }
        
        if (totalWeight > 0) {
            result[col] = {
                column: col,
                yOffset: weightedY / totalWeight,
                intensity: Math.round(weightedIntensity / totalWeight),
                width: Math.round(weightedWidth / totalWeight),
                valid: (weightedWidth / totalWeight) > 0
            };
        }
    }
    
    return result;
}
