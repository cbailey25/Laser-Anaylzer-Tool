import React, { useMemo, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Edges, Line, OrthographicCamera, Text } from '@react-three/drei';
import * as THREE from 'three';

const SCALE = 0.001;

/**
 * Standard Coordinate Mapping:
 * X = cross-track (profile)
 * Y = forward (longitudinal)
 * Z = depth (nadir)
 */
const toScene = (x, y, z) => [
    (Number.isFinite(x) ? x : 0) * SCALE,
    (Number.isFinite(y) ? y : 0) * SCALE,
    (Number.isFinite(z) ? z : 0) * SCALE
];

/**
 * Cross Section Mapping:
 * World X (mm) -> Scene X (units)
 * World Z (mm) -> Scene -Y (units) (Deeper is lower)
 * World Y (mm) -> Scene Z (Flattened to 0)
 */
const toSceneXZ = (x, y, z) => [
    (Number.isFinite(x) ? x : 0) * SCALE,
    -(Number.isFinite(z) ? z : 0) * SCALE,
    0
];

/**
 * LaserProfilePoints — renders 3D points efficiently using THREE.Points.
 */
function LaserProfilePoints({ points, pipeResult, useXZ = false }) {
    const toPos = useXZ ? toSceneXZ : toScene;

    const geometry = useMemo(() => {
        if (!points || !Array.isArray(points) || points.length === 0) {
            return new THREE.BufferGeometry();
        }

        const posArray = new Float32Array(points.length * 3);
        const colorArray = new Float32Array(points.length * 3);

        const colorValid = new THREE.Color('#22c55e');
        const colorSeabed = new THREE.Color('#3b82f6');

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const pos = toPos(p.x, p.y, p.z);

            posArray[i * 3] = pos[0];
            posArray[i * 3 + 1] = pos[1];
            posArray[i * 3 + 2] = pos[2];

            const isPipe = pipeResult && i >= pipeResult.inlierStart && i <= pipeResult.inlierEnd;
            const isAnode = pipeResult && pipeResult.anodeIndices && pipeResult.anodeIndices.includes(i);

            let c = colorSeabed;
            if (isAnode) {
                c = new THREE.Color('#fb923c'); // Orange for Anodes
            } else if (isPipe) {
                c = colorValid;
            }

            colorArray[i * 3] = c.r;
            colorArray[i * 3 + 1] = c.g;
            colorArray[i * 3 + 2] = c.b;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
        return geo;
    }, [points, pipeResult, useXZ]);

    if (!points || points.length === 0) return null;

    return (
        <points geometry={geometry}>
            <pointsMaterial size={6} sizeAttenuation={false} vertexColors />
        </points>
    );
}

/**
 * PipeVisualization — renders a circle at the predicted pipe location.
 */
function PipeVisualization({ pipeResult, points, useXZ = false }) {
    if (!pipeResult) return null;

    const { cx, cz, radius, inlierStart, inlierEnd, diameter } = pipeResult;
    const sceneRadius = radius * SCALE;
    const displayDiameter = diameter || (radius * 2);

    const inliers = points.slice(inlierStart, inlierEnd + 1);
    const validInliers = inliers.filter(p => Number.isFinite(p.y));
    const cy = validInliers.length > 0 ? (validInliers.reduce((sum, p) => sum + p.y, 0) / validInliers.length) : 0;

    const pos = useXZ ? toSceneXZ(cx, cy, cz) : toScene(cx, cy, cz);

    // Calculate arc angles for the thick inlier highlight
    const pStart = points[inlierStart];
    const pEnd = points[inlierEnd];
    const startAngle = Math.atan2(-(pStart.z - cz), pStart.x - cx);
    const endAngle = Math.atan2(-(pEnd.z - cz), pEnd.x - cx);

    let tStart = Math.min(startAngle, endAngle);
    let tLen = Math.max(startAngle, endAngle) - tStart;

    // Proportional scaling for UI elements
    const labelScale = Math.max(0.4, Math.min(2.0, sceneRadius / 0.25)); // Normalized to 500mm pipe (0.25 radius)
    const arrowSize = 0.006 * labelScale;
    const fontSize = 0.013 * labelScale;
    const textOffset = 0.004 * labelScale;
    const dotSize = 0.0015 * labelScale;

    return (
        <group position={pos}>
            {/* Full fit circle (thin, background) */}
            <mesh rotation={useXZ ? [0, 0, 0] : [Math.PI / 2, 0, 0]}>
                <ringGeometry args={[sceneRadius - 0.0001, sceneRadius + 0.0001, 128]} />
                <meshBasicMaterial color="#22c55e" transparent opacity={0.4} side={THREE.DoubleSide} />
            </mesh>

            {/* Inlier arc (thick, bright green highlight) */}
            <mesh rotation={useXZ ? [0, 0, 0] : [Math.PI / 2, 0, 0]}>
                <ringGeometry args={[sceneRadius - (0.001 * labelScale), sceneRadius + (0.001 * labelScale), 80, 1, tStart, tLen]} />
                <meshBasicMaterial color="#4ade80" side={THREE.DoubleSide} />
            </mesh>

            {/* Dimension Line (Horizontal) */}
            <Line
                points={[[-sceneRadius, 0, 0], [sceneRadius, 0, 0]]}
                color="#ffffff"
                lineWidth={1}
                transparent
                opacity={0.6}
            />

            {/* Left Arrow Head */}
            <Line
                points={[
                    [-sceneRadius + arrowSize, arrowSize * 0.4, 0],
                    [-sceneRadius, 0, 0],
                    [-sceneRadius + arrowSize, -arrowSize * 0.4, 0]
                ]}
                color="#ffffff"
                lineWidth={1 * labelScale}
                transparent
                opacity={0.8}
            />

            {/* Right Arrow Head */}
            <Line
                points={[
                    [sceneRadius - arrowSize, arrowSize * 0.4, 0],
                    [sceneRadius, 0, 0],
                    [sceneRadius - arrowSize, -arrowSize * 0.4, 0]
                ]}
                color="#ffffff"
                lineWidth={1 * labelScale}
                transparent
                opacity={0.8}
            />

            {/* Diameter Label */}
            <Text
                position={[0, textOffset, 0]}
                fontSize={fontSize}
                color="#ffffff"
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.0015 * labelScale}
                outlineColor="#0a0e1a"
            >
                {`${displayDiameter.toFixed(0)} mm`}
            </Text>

            {/* Center dot */}
            <mesh>
                <sphereGeometry args={[dotSize, 8, 8]} />
                <meshBasicMaterial color="#22c55e" />
            </mesh>
        </group>
    );
}

/**
 * LaserPlane — visualises the laser fan.
 */
function LaserPlane({ params }) {
    if (!params) return null;
    return (
        <group
            position={toScene(params.laserX, params.laserY, params.laserZ)}
            rotation={[
                -(params.laserPitch || 0) * Math.PI / 180,
                (params.laserYaw || 0) * Math.PI / 180,
                (params.laserRoll || 0) * Math.PI / 180
            ]}
        >
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <circleGeometry args={[6, 64, Math.PI / 2 - Math.PI / 6, Math.PI / 3]} />
                <meshStandardMaterial color="#22c55e" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <circleGeometry args={[6, 64, Math.PI / 2 - Math.PI / 6, Math.PI / 3]} />
                <meshBasicMaterial color="#22c55e" wireframe transparent opacity={0.1} />
            </mesh>
        </group>
    );
}

/**
 * CameraFOV — visualises the camera's FOV.
 */
function CameraFOV({ params }) {
    if (!params) return null;

    const width = params.imageWidth || 2048;
    const height = params.imageHeight || 1152;
    const pxMm = (params.pixelSize || 11) / 1000;
    const f = params.focalLength || 24;
    const far = 6000 * SCALE;

    const hHalf = (width / 2 * pxMm) / f;
    const vHalf = (height / 2 * pxMm) / f;

    const x = far * hHalf;
    const y = far * vHalf;
    const z = far;

    const frustumPoints = [
        [0, 0, 0], [x, y, z], [0, 0, 0], [-x, y, z], [0, 0, 0], [x, -y, z], [0, 0, 0], [-x, -y, z],
        [x, y, z], [-x, y, z], [-x, y, z], [-x, -y, z], [-x, -y, z], [x, -y, z], [x, -y, z], [x, y, z]
    ].map(p => new THREE.Vector3(...p));

    return (
        <group
            position={toScene(params.camX, params.camY, params.camZ)}
            rotation={[
                -(params.camPitch || 0) * Math.PI / 180,
                (params.camYaw || 0) * Math.PI / 180,
                (params.camRoll || 0) * Math.PI / 180
            ]}
        >
            {Array.from({ length: 8 }).map((_, i) => (
                <Line
                    key={i}
                    points={[frustumPoints[i * 2], frustumPoints[i * 2 + 1]]}
                    color="#8b5cf6"
                    lineWidth={1}
                    transparent
                    opacity={0.3}
                />
            ))}
        </group>
    );
}

/**
 * CameraController — handles viewpoint switching.
 */
function CameraController({ mode, target }) {
    const { camera, controls } = useThree();

    useEffect(() => {
        if (!controls || !mode) return;
        const distance = 0.8;

        switch (mode) {
            case 'X':
                camera.position.set(target.x + distance, target.y, target.z);
                break;
            case 'Y':
                camera.position.set(target.x, target.y + distance, target.z);
                break;
            case 'Z':
                camera.position.set(target.x, target.y, target.z - distance);
                break;
            case 'ISO':
                camera.position.set(target.x + 0.6, target.y + 0.6, target.z + 0.6);
                break;
            default:
                return;
        }

        controls.target.copy(target);
        controls.update();
    }, [mode, target, camera, controls]);

    return null;
}

export default function Viewer3D({ points, pipeResult, params }) {
    // Persistent targets to prevent camera jumps on profile scrolling
    const [viewTarget3D, setViewTarget3D] = useState(new THREE.Vector3(0, 0, 0.15));
    const [viewTargetXZ, setViewTargetXZ] = useState(new THREE.Vector3(0, -0.15, 0));
    const [isInitialized, setIsInitialized] = useState(false);

    const [viewMode, setViewMode] = useState('ISO');

    // Only update targets the first time data arrives (or after a reset)
    useEffect(() => {
        if (points && points.length > 0 && !isInitialized) {
            let sx = 0, sy = 0, sz = 0, c = 0;
            for (const p of points) {
                if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
                    sx += p.x; sy += p.y; sz += p.z;
                    c++;
                }
            }
            if (c > 0) {
                const target3D = new THREE.Vector3(sx / c * SCALE, sy / c * SCALE, sz / c * SCALE);
                const targetXZ = new THREE.Vector3(sx / c * SCALE, -(sz / c * SCALE), 0);
                setViewTarget3D(target3D);
                setViewTargetXZ(targetXZ);
                setIsInitialized(true);
            }
        }
    }, [points, isInitialized]);

    const gridColor = '#334155';
    const gridFade = '#1e293b';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#0a0e1a' }}>
            {/* 3D World View */}
            <div style={{ flex: 1, position: 'relative', borderBottom: '1px solid #1e293b' }}>
                <div className="viewer-overlay">
                    <div className="viewer-badge">3D World View</div>
                    <div className="viewer-toolbar">
                        {['X', 'Y', 'Z', 'ISO'].map(m => (
                            <button
                                key={m}
                                className={`view-btn ${viewMode === m ? 'active' : ''}`}
                                onClick={() => setViewMode(m)}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>
                <Canvas camera={{ position: [0.6, 0.6, 0.6], fov: 45, near: 0.001, far: 100 }} gl={{ antialias: true }}>
                    <CameraController mode={viewMode} target={viewTarget3D} />
                    <ambientLight intensity={0.7} />
                    <pointLight position={[1, 1, 1]} intensity={0.8} />
                    <LaserProfilePoints points={points} pipeResult={pipeResult} />
                    <PipeVisualization points={points} pipeResult={pipeResult} />
                    <LaserPlane params={params} />
                    <CameraFOV params={params} />
                    <axesHelper args={[0.5]} />
                    <gridHelper
                        key="grid-3d"
                        args={[10, 100, gridColor, gridFade]}
                        rotation={[Math.PI / 2, 0, 0]}
                        position={toScene(params.camX, params.camY, params.camZ + 6000)}
                    />
                    {params && (
                        <>
                            <group position={toScene(params.camX, params.camY, params.camZ)} rotation={[-(params.camPitch || 0) * Math.PI / 180, (params.camYaw || 0) * Math.PI / 180, (params.camRoll || 0) * Math.PI / 180]}>
                                <mesh><boxGeometry args={[0.06, 0.04, 0.04]} /><meshStandardMaterial color="#8b5cf6" /><Edges color="#5b21b6" /></mesh>
                            </group>
                            <group position={toScene(params.laserX, params.laserY, params.laserZ)} rotation={[-(params.laserPitch || 0) * Math.PI / 180, (params.laserYaw || 0) * Math.PI / 180, (params.laserRoll || 0) * Math.PI / 180]}>
                                <mesh><boxGeometry args={[0.05, 0.02, 0.02]} /><meshStandardMaterial color="#ef4444" /><Edges color="#991b1b" /></mesh>
                            </group>
                        </>
                    )}
                    <OrbitControls target={viewTarget3D} makeDefault enableDamping dampingFactor={0.1} />
                </Canvas>
            </div>

            {/* X-Z Profile View */}
            <div style={{ flex: 1, position: 'relative' }}>
                <div className="viewer-overlay"><div className="viewer-badge">X-Z Cross Section (Profile View)</div></div>
                <Canvas gl={{ antialias: true }}>
                    <OrthographicCamera
                        makeDefault
                        position={[viewTargetXZ.x, viewTargetXZ.y, 10]}
                        zoom={400}
                        near={0.1}
                        far={100}
                        up={[0, 1, 0]}
                    />
                    <ambientLight intensity={1} />
                    <LaserProfilePoints points={points} pipeResult={pipeResult} useXZ />
                    <PipeVisualization points={points} pipeResult={pipeResult} useXZ />
                    <axesHelper args={[0.2]} />
                    <gridHelper
                        key="grid-xz"
                        args={[10, 100, gridColor, gridFade]}
                        rotation={[Math.PI / 2, 0, 0]}
                        position={[0, 0, -0.01]}
                    />
                    <OrbitControls target={viewTargetXZ} enableRotate={false} enablePan screenSpacePanning={true} />

                </Canvas>
                <div className="viewer-legend">
                    <div className="legend-item"><span className="dot seabed"></span> Seabed</div>
                    <div className="legend-item"><span className="dot pipe"></span> Pipeline</div>
                    <div className="legend-item"><span className="dot anode"></span> Anode</div>
                </div>
            </div>
        </div>
    );
}
