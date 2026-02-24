import * as THREE from 'three';

/**
 * Laser Triangulation Engine
 * 
 * Converts raw 2D laser line pixel positions into 3D world coordinates
 * using the geometry of a triangulation laser system (camera + laser).
 * 
 * Coordinate system:
 *   X = cross-track (left/right)
 *   Y = elevation (up/down)
 *   Z = depth (downward from camera, positive = further)
 */

export function triangulate2Dto3D(pixelColumns, pixelRows, params) {
    const { focalLength, pixelSize, imageWidth, imageHeight } = params;

    // Default image height if not specified, usually we know cy
    const cx = imageWidth / 2;
    const cy = (imageHeight || 1152) / 2;
    const pxMm = pixelSize / 1000;

    // 1. Build Camera Object in World Space
    const camPos = new THREE.Vector3(params.camX || 0, params.camY || 0, params.camZ || 0);
    const camRot = new THREE.Euler(
        -(params.camPitch || 0) * Math.PI / 180,
        (params.camYaw || 0) * Math.PI / 180,
        (params.camRoll || 0) * Math.PI / 180,
        'XYZ'
    );
    const cameraQuat = new THREE.Quaternion().setFromEuler(camRot);

    // 2. Build Laser Plane in World Space
    // Our laser mesh starts on XY plane pointing +Z. 
    // It is rotated by Math.PI / 2 around X, meaning normal becomes -Y.
    const laserNormalLocal = new THREE.Vector3(0, -1, 0);
    const laserRot = new THREE.Euler(
        -(params.laserPitch || 0) * Math.PI / 180,
        (params.laserYaw || 0) * Math.PI / 180,
        (params.laserRoll || 0) * Math.PI / 180,
        'XYZ'
    );
    const laserQuat = new THREE.Quaternion().setFromEuler(laserRot);
    const planeNormal = laserNormalLocal.clone().applyQuaternion(laserQuat).normalize();
    const planePoint = new THREE.Vector3(params.laserX || 0, params.laserY || 0, params.laserZ || 0);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint);

    const points = [];

    for (let i = 0; i < pixelColumns.length; i++) {
        const u = pixelColumns[i];
        const v = pixelRows[i];

        // Ray direction in camera local space
        // Standard pinhole: looking down +Z.
        // If v increases downwards, local Y goes down.
        const dirX = (u - cx) * pxMm / focalLength;
        const dirY = (cy - v) * pxMm / focalLength;
        const dirZ = 1.0;

        const localDir = new THREE.Vector3(dirX, dirY, dirZ).normalize();

        // Transform ray to world space
        const worldDir = localDir.clone().applyQuaternion(cameraQuat);
        const ray = new THREE.Ray(camPos, worldDir);

        const intersection = new THREE.Vector3();
        const hit = ray.intersectPlane(plane, intersection);

        if (hit && intersection.z > camPos.z) {
            points.push({ x: intersection.x, y: intersection.y, z: intersection.z });
        }
    }

    return points;
}


/**
 * Generate a synthetic 3D laser profile: a pipe (circular arc) sitting on
 * a flat seabed. Returns the 3D points directly — no pixel round-trip needed.
 *
 * The profile is a cross-section in the X-Z plane:
 *   - Seabed at a fixed depth (Z = seabedDepth)
 *   - Pipe centred at X = pipeOffsetX, with its bottom tangent to the seabed
 *   - The laser "sees" the top surface of the pipe (upper semicircle arc)
 *
 * @param {object} params            Laser system params (used only for seabed depth calc)
 * @param {number} pipeDiameterMm    Pipe outer diameter (mm)
 * @param {number} [pipeOffsetX=0]   Horizontal offset of pipe centre from origin (mm)
 * @param {number} [numPoints=512]   Number of profile points
 * @returns {{ points: {x: number, z: number}[] }}
 */
export function generateDemoProfile(params, pipeDiameterMm = 200, pipeOffsetX = 0, numPoints = 512) {
    const pipeRadius = pipeDiameterMm / 2;

    // Laser plane exact definition in world space
    const laserNormalLocal = new THREE.Vector3(0, -1, 0);
    const laserRot = new THREE.Euler(
        -(params.laserPitch || 0) * Math.PI / 180,
        (params.laserYaw || 0) * Math.PI / 180,
        (params.laserRoll || 0) * Math.PI / 180,
        'XYZ'
    );
    const planeNormal = laserNormalLocal.clone().applyQuaternion(new THREE.Quaternion().setFromEuler(laserRot)).normalize();
    const planePoint = new THREE.Vector3(params.laserX || 0, params.laserY || 0, params.laserZ || 0);

    function getYOnPlane(x, z) {
        if (Math.abs(planeNormal.y) < 1e-6) return 0;
        return planePoint.y - (planeNormal.x * (x - planePoint.x) + planeNormal.z * (z - planePoint.z)) / planeNormal.y;
    }

    // Determine a reasonable Z distance based on camera pitch
    const seabedZ = (params.camZ || 0) + 1500;

    // Pipe bottom touches the seabed, so pipe centre is one radius above the seabed (closer in Z)
    const pipeCentreX = pipeOffsetX;
    const pipeCentreZ = seabedZ - pipeRadius;

    // Profile extends ±3× pipe diameters for context
    const profileExtent = pipeDiameterMm * 3;
    const xMin = pipeCentreX - profileExtent;
    const xMax = pipeCentreX + profileExtent;
    const step = (xMax - xMin) / (numPoints - 1);

    const points = [];

    for (let i = 0; i < numPoints; i++) {
        const x = xMin + i * step;
        const dx = x - pipeCentreX;

        let z;
        if (Math.abs(dx) <= pipeRadius) {
            // On the pipe — upper arc of the circle (closer to camera = smaller Z)
            const dz = Math.sqrt(pipeRadius * pipeRadius - dx * dx);
            z = pipeCentreZ - dz;
        } else {
            // On the seabed
            z = seabedZ;

            // Add subtle seabed texture (small noise)
            const noise = Math.sin(x * 0.05) * 0.5 + Math.sin(x * 0.13) * 0.3;
            z += noise;
        }

        const y = getYOnPlane(x, z);
        points.push({ x, y, z });
    }

    return { points };
}
