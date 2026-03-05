// Utility to filter out noise points (points without close neighbours)
// A point is considered noise if it has fewer than MIN_NEIGHBORS within RADIUS distance.

export function filterNoisePoints(points, radius = 5, minNeighbors = 2) {
    if (!Array.isArray(points) || points.length === 0) return [];

    // O(N) Spatial Grid Optimization to prevent UI freezing
    const cellSize = Math.max(radius, 1);
    const radiusSq = radius * radius;
    const grid = new Map();

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;

        const cx = Math.floor(p.x / cellSize);
        const cy = Math.floor(p.y / cellSize);
        const cz = Math.floor(p.z / cellSize);

        const key = `${cx},${cy},${cz}`;
        let cell = grid.get(key);
        if (!cell) {
            cell = [];
            grid.set(key, cell);
        }
        cell.push(p);
    }

    const filtered = [];

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;

        let neighborCount = 0;
        const cx = Math.floor(p.x / cellSize);
        const cy = Math.floor(p.y / cellSize);
        const cz = Math.floor(p.z / cellSize);

        let found = false;

        for (let dx = -1; dx <= 1 && !found; dx++) {
            for (let dy = -1; dy <= 1 && !found; dy++) {
                for (let dz = -1; dz <= 1 && !found; dz++) {
                    const cell = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
                    if (cell) {
                        for (let k = 0; k < cell.length; k++) {
                            const q = cell[k];
                            // Skip same object reference directly instead of indices
                            if (p === q) continue;

                            const dpx = p.x - q.x;
                            const dpy = p.y - q.y;
                            const dpz = p.z - q.z;
                            if (dpx * dpx + dpy * dpy + dpz * dpz <= radiusSq) {
                                neighborCount++;
                                if (neighborCount >= minNeighbors) {
                                    found = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (neighborCount >= minNeighbors) {
            filtered.push(p);
        }
    }

    return filtered;
}
