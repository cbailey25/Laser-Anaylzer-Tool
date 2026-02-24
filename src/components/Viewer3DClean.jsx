import React, { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line, Text, Edges, Html } from '@react-three/drei';
import * as THREE from 'three';

const SCALE = 0.001;

// Maps World (X,Y,Z) to Scene (X,Y,Z). Depth (Z) maps to Scene Z.
const toScene = (x, y, z) => [x * SCALE, y * SCALE, z * SCALE];

// For X-Z cross-section view: Map World (X,Y,Z) to Scene (X,Z,Y) 
// This creates a top-down view where X is horizontal and Z is vertical
const toSceneXZ = (x, y, z) => {
    // World X -> Scene X (horizontal)
    // World Z -> Scene Y (vertical, amplified)
    // World Y -> Scene Z (discarded by setting to 0)
    const zAmplified = (z - 0.15) * 100; // Amplify Z variation
    const scenePos = toScene(x, zAmplified, 0); // Use toScene for proper scaling
    
    return scenePos;
};

// X-Z version of LaserProfileLine
function LaserProfileLineXZ({ points, pipeResult }) {
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
    const [currentZoom, setCurrentZoom] = useState(1000); // Track zoom level for scalebar
    
    // Fixed camera position for X-Z cross-section view (top-down view of X-Z plane)
    // Camera positioned directly above looking straight down at X-Z plane
    const cameraPositionBottom = [0, 2, 0]; // Directly above on Y-axis
    const cameraTargetBottom = [0, 0, 0]; // Look straight down at origin

    // Scene elements for X-Z view
    const sceneXZ = (
        <>
            <ambientLight intensity={0.8} />
            <directionalLight position={[0, -1, 0]} intensity={0.5} />
            
            {/* Display laser points as individual points */}
            <LaserProfileLineXZ points={points} pipeResult={pipeResult} />
            
            {/* Enhanced pipe detection visualization */}
            {pipeResult && (() => {
                // Calculate circle center and radius from inlier points
                const inlierPoints = points.slice(pipeResult.inlierStart, pipeResult.inlierEnd + 1);
                const centerX = inlierPoints.reduce((sum, p) => sum + p.x, 0) / inlierPoints.length;
                const centerZ = inlierPoints.reduce((sum, p) => sum + p.z, 0) / inlierPoints.length;
                const radius = 0.02; // Approximate pipe radius in world coordinates
                
                return (
                    <group position={toSceneXZ(centerX, 0, centerZ)}>
                        {/* Main pipe circle */}
                        <mesh rotation={[Math.PI/2, 0, 0]}>
                            <ringGeometry args={[radius * SCALE, 0.002, 32]} />
                            <meshBasicMaterial color="#22c55e" transparent opacity={0.5} />
                        </mesh>
                        
                        {/* Pipe center point */}
                        <mesh position={toSceneXZ(centerX, 0, centerZ)}>
                            <sphereGeometry args={[0.005, 8, 8]} />
                            <meshBasicMaterial color="#22c55e" />
                        </mesh>
                        
                        {/* Inlier range indicator */}
                        <Line
                            points={[
                                toSceneXZ(points[pipeResult.inlierStart].x, 0, points[pipeResult.inlierStart].z),
                                toSceneXZ(points[pipeResult.inlierEnd].x, 0, points[pipeResult.inlierEnd].z)
                            ]}
                            color="#22c55e"
                            lineWidth={2}
                        />
                        
                        {/* Confidence indicators */}
                        <Text position={toSceneXZ(centerX, 0, centerZ + radius + 0.01)} fontSize={0.02} color="#22c55e">
                            Pipe Detected
                        </Text>
                        <Text position={toSceneXZ(centerX, 0, centerZ + radius - 0.01)} fontSize={0.015} color="#22c55e">
                            {Math.round(pipeResult.confidence * 100)}% confidence
                        </Text>
                    </group>
                );
            })()}
            
            <axesHelper args={[0.2]} />
        </>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            {/* TOP: 3D World View */}
            <div style={{ flex: 1, position: 'relative' }}>
                <div className="viewer-overlay">
                    <div className="viewer-badge">
                        3D World View
                    </div>
                </div>
                <Canvas
                    camera={{ position: [0.5, 0.5, 0.5], zoom: 500, near: 0.001, far: 100 }}
                    orthographic={false}
                    gl={{ antialias: true, alpha: false }}
                    style={{ background: '#0a0e1a', width: '100%', height: '100%' }}
                >
                    <OrbitControls enableDamping dampingFactor={0.08} />
                    {/* 3D scene elements would go here */}
                </Canvas>
            </div>

            {/* BOTTOM: X-Z Cross Section */}
            <div style={{ flex: 1, position: 'relative' }}>
                <div className="viewer-overlay">
                    <div className="viewer-badge">
                        X-Z Cross Section (Looking through Y)
                    </div>
                </div>
                <Canvas
                    camera={{ position: cameraPositionBottom, zoom: 1000, near: 0.001, far: 100 }}
                    orthographic={true}
                    gl={{ antialias: true, alpha: false }}
                    style={{ background: '#0a0e1a', width: '100%', height: '100%' }}
                    onWheel={(e) => {
                        e.preventDefault();
                        const newZoom = currentZoom + (e.deltaY > 0 ? -100 : 100);
                        setCurrentZoom(Math.max(100, Math.min(5000, newZoom)));
                    }}
                >
                    <OrbitControls
                        target={cameraTargetBottom}
                        enableDamping
                        dampingFactor={0.08}
                        enableRotate={false}
                        enablePan={true}
                        screenSpacePanning={false}
                        enableZoom={true}
                    />
                    {sceneXZ}
                </Canvas>
            </div>
        </div>
    );
}
