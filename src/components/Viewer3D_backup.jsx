import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line, Text, Edges } from '@react-three/drei';
import * as THREE from 'three';

const SCALE = 0.001;

// Maps World (X,Y,Z) to Scene (X,Y,Z). Depth (Z) maps to Scene Z.
const toScene = (x, y, z) => [x * SCALE, y * SCALE, z * SCALE];

// For X-Z cross-section view: Map World (X,Y,Z) to Scene (X,Z,Y) 
// This swaps Y and Z so we see X-Z plane with Z vertical
const toSceneXZ = (x, y, z) => [x * SCALE, z * SCALE, y * SCALE];

function LaserProfileLine({ points, pipeResult, params }) {
    const positions = useMemo(() => {
        if (!points || points.length === 0) return [];
        return points.map(p => toScene(p.x, p.y, p.z));
    }, [points]);

    const colors = useMemo(() => {
        if (!points || points.length === 0) return [];
        return points.map((_, i) => {
            if (pipeResult && i >= pipeResult.inlierStart && i <= pipeResult.inlierEnd) {
                return '#22c55e'; // green for pipe inliers
            }
            return '#3b82f6'; // blue for seabed
        });
    }, [points, pipeResult]);

    if (positions.length === 0) return null;

    // Render as individual points instead of a line
    return (
        <group>
            {positions.map((position, i) => (
                <mesh key={i} position={position}>
                    <sphereGeometry args={[0.002, 8, 8]} />
                    <meshBasicMaterial color={colors[i]} />
                </mesh>
            ))}
        </group>
    );
}

// X-Z version of LaserProfileLine
function LaserProfileLineXZ({ points, pipeResult, params }) {
    const positions = useMemo(() => {
        if (!points || points.length === 0) return [];
        return points.map(p => toSceneXZ(p.x, p.y, p.z));
    }, [points]);

    const colors = useMemo(() => {
        if (!points || points.length === 0) return [];
        return points.map((_, i) => {
            if (pipeResult && i >= pipeResult.inlierStart && i <= pipeResult.inlierEnd) {
                return '#22c55e'; // green for pipe inliers
            }
            return '#3b82f6'; // blue for seabed
        });
    }, [points, pipeResult]);

    if (positions.length === 0) return null;

    // Render as individual points instead of a line
    return (
        <group>
            {positions.map((position, i) => (
                <mesh key={i} position={position}>
                    <sphereGeometry args={[0.002, 8, 8]} />
                    <meshBasicMaterial color={colors[i]} />
                </mesh>
            ))}
        </group>
    );
}

export default function Viewer3D({ points, pipeResult, params }) {
    // Compute camera target at the centroid of the data (only for 3D view)
    const cameraTarget = useMemo(() => {
        if (!points || points.length === 0) return [0, 0, 0.15];
        let sumX = 0, sumY = 0, sumZ = 0;
        for (const p of points) {
            sumX += p.x;
            sumY += p.y;
            sumZ += p.z;
        }
        const n = points.length;
        return [sumX / n, sumY / n, sumZ / n];
    }, [points]);

    // Fixed camera position for X-Z cross-section view (looking along Y-axis)
    const cameraPositionBottom = [0, 1, 0.15]; // Fixed position
    const cameraTargetBottom = [0, 0, 0.15]; // Fixed target - always looks at origin

    // Camera from an angle for 3D world view
    const cameraPositionTop = useMemo(() => {
        return [cameraTarget[0] + 0.3, 0.3, cameraTarget[2] - 0.3];
    }, [cameraTarget]);

    // Scene elements for 3D view
    const scene3D = (
        <>
            <ambientLight intensity={0.8} />
            <directionalLight position={[0, -1, 0]} intensity={0.5} />
            <LaserProfileLine points={points} pipeResult={pipeResult} params={params} />
            <axesHelper args={[0.2]} />
        </>
    );

    // Scene elements for X-Z view
    const sceneXZ = (
        <>
            <ambientLight intensity={0.8} />
            <directionalLight position={[0, -1, 0]} intensity={0.5} />
            <LaserProfileLineXZ points={points} pipeResult={pipeResult} params={params} />
            <axesHelper args={[0.2]} />
        </>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* TOP: 3D View */}
            <div style={{ flex: 1, borderBottom: '1px solid #1e293b' }}>
                <Canvas
                    camera={{ position: cameraPositionTop, fov: 40, near: 0.001, far: 100 }}
                    gl={{ antialias: true, alpha: false }}
                    style={{ background: '#0a0e1a' }}
                >
                    <OrbitControls
                        target={cameraTarget}
                        enableDamping
                        dampingFactor={0.08}
                        minDistance={0.05}
                        maxDistance={5}
                        enableRotate={true}
                    />
                    {scene3D}
                </Canvas>
            </div>

            {/* BOTTOM: X-Z Cross Section */}
            <div style={{ flex: 1 }}>
                <Canvas
                    camera={{ position: cameraPositionBottom, zoom: 600, near: 0.001, far: 100 }}
                    orthographic={true}
                    gl={{ antialias: true, alpha: false }}
                    style={{ background: '#0a0e1a' }}
                >
                    <OrbitControls
                        target={cameraTargetBottom}
                        enableDamping
                        dampingFactor={0.08}
                        minDistance={0.05}
                        maxDistance={5}
                        enableRotate={false}
                        enablePan={true}
                        screenSpacePanning={false}
                    />
                    {sceneXZ}
                </Canvas>
            </div>
        </div>
    );
}
