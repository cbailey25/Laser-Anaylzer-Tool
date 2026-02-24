import React, { useState, useMemo, useCallback, useRef } from 'react';
import LaserSystemPanel from './components/LaserSystemPanel.jsx';
import PipeDetectionPanel from './components/PipeDetectionPanel.jsx';
import FileLoaderPanel from './components/FileLoaderPanel.jsx';
import Viewer3D from './components/Viewer3D.jsx';
import { generateDemoProfile, triangulate2Dto3D } from './utils/triangulation.js';
import { parseBinFile, profileToPixelCoords } from './utils/binParser.js';
import { detectPipe } from './utils/pipeFitting.js';

const DEFAULT_PARAMS = {
    focalLength: 24,    // mm
    pixelSize: 11,      // µm

    // Camera Lever Arm (mm) & Rotation (deg)
    camX: 0, camY: 0, camZ: 0,
    camPitch: 0, camRoll: 0, camYaw: 0,

    // Laser Lever Arm (mm) & Rotation (deg)
    laserX: 0, laserY: 585, laserZ: 0,
    laserPitch: -19, laserRoll: 0, laserYaw: 0,
};

const DEFAULT_PIPE_DIAMETER = 500; // mm

export default function App() {
    const [params, setParams] = useState(DEFAULT_PARAMS);
    const [pipeEnabled, setPipeEnabled] = useState(true);
    const [pipeDiameter, setPipeDiameter] = useState(DEFAULT_PIPE_DIAMETER);

    // File loading state
    const [binData, setBinData] = useState(null);       // parsed BinFileData
    const [fileName, setFileName] = useState(null);
    const [selectedProfile, setSelectedProfile] = useState(0);
    const lastPipeResult = useRef(null);

    // Handle file loaded
    const handleFileLoaded = useCallback((buffer, name) => {
        try {
            const data = parseBinFile(buffer);
            setBinData(data);
            setFileName(name);
            setSelectedProfile(0);

            // imageWidth is redundant, we use it only if needed by low-level utils
            setParams(prev => ({
                ...prev,
            }));
        } catch (e) {
            console.error('Failed to parse bin file:', e);
            alert(`Failed to parse file: ${e.message}`);
        }
    }, []);

    const handleClearFile = useCallback(() => {
        setBinData(null);
        setFileName(null);
        setSelectedProfile(0);
        lastPipeResult.current = null;
    }, []);

    // File info for the panel
    const fileInfo = useMemo(() => {
        if (!binData) return null;
        const currentProfile = binData.profiles[selectedProfile];
        return {
            fileName,
            profileCount: binData.profileCount,
            pointsPerProfile: binData.header.pointsPerProfile,
            currentComment: currentProfile?.comment || null,
        };
    }, [binData, fileName, selectedProfile]);

    // Compute 3D profile: from loaded file OR demo data
    const { profile3D, pipeResult, derivedParams } = useMemo(() => {
        try {
            let points;
            // Provide theta explicitly for triangulation from the difference, 
            // but the user mentions we should just keep theta independent if they want.
            // Actually, we'll keep `theta` derived from the pitch for triangulation to work out of box,
            // or we use the `laserPitch` itself:
            const currentTheta = Math.abs(params.laserPitch - params.camPitch);
            const derived = { ...params, theta: currentTheta || 30 };

            if (binData && binData.profiles.length > 0) {
                // ---- File mode: triangulate loaded profile ----
                const profile = binData.profiles[selectedProfile];
                if (!profile) return { profile3D: [], pipeResult: null, derivedParams: derived };

                const { pixelColumns, pixelRows } = profileToPixelCoords(profile);
                if (pixelColumns.length < 3) return { profile3D: [], pipeResult: null, derivedParams: derived };

                points = triangulate2Dto3D(pixelColumns, pixelRows, derived);
            } else {
                // ---- Demo mode: generate synthetic profile ----
                const demo = generateDemoProfile(derived, pipeDiameter);
                points = demo.points;
            }

            // Detect pipe if enabled
            let pipe = null;
            if (pipeEnabled && points.length > 10) {
                pipe = detectPipe(points, pipeDiameter, { prevResult: lastPipeResult.current });
                if (pipe) {
                    lastPipeResult.current = pipe;
                }
            }

            return { profile3D: points, pipeResult: pipe, derivedParams: derived };
        } catch (e) {
            console.warn('Computation error:', e);
            const currentTheta = Math.abs(params.camPitch - params.laserPitch);
            return { profile3D: [], pipeResult: null, derivedParams: { ...params, theta: currentTheta } };
        }
    }, [params, pipeEnabled, pipeDiameter, binData, selectedProfile]);

    const handleParamsChange = useCallback((newParams) => {
        setParams(newParams);
    }, []);

    return (
        <div className="app-container">
            {/* Left sidebar */}
            <div className="sidebar">
                {/* App header */}
                <div className="app-header">
                    <div className="app-logo">⟁</div>
                    <div>
                        <div className="app-title">Laser Analyzer</div>
                        <div className="app-subtitle">Triangulation Laser System</div>
                    </div>
                </div>

                {/* File loader */}
                <FileLoaderPanel
                    onFileLoaded={handleFileLoaded}
                    fileInfo={fileInfo}
                    selectedProfile={selectedProfile}
                    onProfileChange={setSelectedProfile}
                    onClearFile={handleClearFile}
                />

                {/* Laser system configuration */}
                <LaserSystemPanel params={params} onChange={handleParamsChange} />


                {/* Pipe detection */}
                <PipeDetectionPanel
                    enabled={pipeEnabled}
                    onToggle={setPipeEnabled}
                    diameter={pipeDiameter}
                    onDiameterChange={setPipeDiameter}
                    result={pipeResult}
                />

                {/* Info panel */}
                <div className="panel" style={{ marginTop: 'auto' }}>
                    <div className="panel-header">
                        <div className="panel-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>ℹ</div>
                        <span className="panel-title">About</span>
                    </div>
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {binData
                            ? 'Viewing loaded laser profile data. Adjust laser system parameters to change the 3D triangulation.'
                            : 'Showing demo profile (synthetic pipe on seabed). Load a .bin file to visualise real data.'
                        }
                    </p>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-sm)' }}>
                        v1.0.0 · Laser Analyzer
                    </p>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
                <Viewer3D points={profile3D} pipeResult={pipeResult} params={derivedParams} />
            </div>
        </div>
    );
}
