import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { filterNoisePoints } from './utils/pointCleaning.js';
import LaserSystemPanel from './components/LaserSystemPanel.jsx';
import PipeDetectionPanel from './components/PipeDetectionPanel.jsx';
import ObjectDetectionPanel from './components/ObjectDetectionPanel.jsx';
import FileLoaderPanel from './components/FileLoaderPanel.jsx';
import Viewer3D from './components/Viewer3D.jsx';
import { generateDemoProfile, triangulate2Dto3D } from './utils/triangulation.js';
import { parseBinFile, profileToPixelCoords } from './utils/binParser.js';
import { detectPipe } from './utils/pipeFitting.js';
import { detectFeatures } from './utils/featureDetection.js';

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

    // Feature Detection state
    const [featuresEnabled, setFeaturesEnabled] = useState(false);
    const [pointCleaningEnabled, setPointCleaningEnabled] = useState(false);
    const [pointCleaningParams, setPointCleaningParams] = useState({ radius: 5, minNeighbors: 2 });
    const [featureParams, setFeatureParams] = useState({ minHeight: 15, minWidth: 30 });
    const [lastDetectionLog, setLastDetectionLog] = useState(null);
    const loggedProfiles = useRef(new Set()); // profileIndex -> Set of feature types logged

    // File loading state
    const [binData, setBinData] = useState(null);       // parsed BinFileData
    const [fileName, setFileName] = useState(null);
    const [selectedProfile, setSelectedProfile] = useState(0);
    const [hoveredFeature, setHoveredFeature] = useState(null);
    const lastPipeResult = useRef(null);

    // Handle file loaded
    const handleFileLoaded = useCallback((buffer, name) => {
        try {
            const data = parseBinFile(buffer);
            setBinData(data);
            setFileName(name);
            setSelectedProfile(0);
            loggedProfiles.current.clear();

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
        loggedProfiles.current.clear();
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
    const [featuresResult, setFeaturesResult] = useState([]);
    const [mlModel, setMlModel] = useState(null);

    // Load AI Model on mount
    useEffect(() => {
        async function loadModel() {
            if (!window.tf) {
                console.warn('TensorFlow.js not loaded. Check index.html');
                return;
            }
            try {
                // Look for model in public/models/tfjs_model/
                const model = await window.tf.loadLayersModel('/models/tfjs_model/model.json');
                console.log('AI Model loaded successfully');
                setMlModel(model);
            } catch (e) {
                console.log('AI Model not found or failed to load. Using heuristic detection.', e.message);
            }
        }
        loadModel();
    }, []);

    // Compute basic 3D profile & pipe: sync
    const { profile3D, pipeResult, derivedParams } = useMemo(() => {
        try {
            let points;
            const currentTheta = Math.abs(params.laserPitch - params.camPitch);
            const derived = { ...params, theta: currentTheta || 30 };

            if (binData && binData.profiles.length > 0) {
                const profile = binData.profiles[selectedProfile];
                if (!profile) return { profile3D: [], pipeResult: null, derivedParams: derived };

                const { pixelColumns, pixelRows } = profileToPixelCoords(profile);
                if (pixelColumns.length < 3) return { profile3D: [], pipeResult: null, derivedParams: derived };

                points = triangulate2Dto3D(pixelColumns, pixelRows, derived);
            } else {
                const demo = generateDemoProfile(derived, pipeDiameter);
                points = demo.points;
            }

            // Apply point cleaning if enabled
            const processedPoints = pointCleaningEnabled
                ? filterNoisePoints(points, pointCleaningParams.radius, pointCleaningParams.minNeighbors)
                : points;

            // Detect pipe if enabled
            let pipe = null;
            if (pipeEnabled && processedPoints.length > 10) {
                pipe = detectPipe(processedPoints, pipeDiameter, { prevResult: lastPipeResult.current });
                if (pipe) {
                    lastPipeResult.current = pipe;
                }
            }

            return { profile3D: processedPoints, pipeResult: pipe, derivedParams: derived };
        } catch (e) {
            console.warn('Computation error:', e);
            const currentTheta = Math.abs(params.camPitch - params.laserPitch);
            return { profile3D: [], pipeResult: null, derivedParams: { ...params, theta: currentTheta } };
        }
    }, [params, pipeEnabled, pipeDiameter, pointCleaningEnabled, pointCleaningParams, binData, selectedProfile]);

    // Async feature detection effect
    useEffect(() => {
        let active = true;

        async function runDetection() {
            if (!featuresEnabled || profile3D.length < 10) {
                setFeaturesResult([]);
                return;
            }

            const results = await detectFeatures(profile3D, { ...featureParams, pipeResult, tfModel: mlModel });
            if (active) {
                setFeaturesResult(results);
            }
        }

        runDetection();
        return () => { active = false; };
    }, [featuresEnabled, featureParams, profile3D, pipeResult, mlModel]);

    // ---- Logging Effect ----
    useEffect(() => {
        if (!featuresEnabled || featuresResult.length === 0 || !binData) return;

        const profileIdx = selectedProfile;
        const currentProfile = binData.profiles[profileIdx];
        const timestamp = currentProfile.comment?.timestamp || `Line-${profileIdx}`;

        // Log each feature found if not already logged for this profile
        featuresResult.forEach(feature => {
            const logKey = `${profileIdx}-${feature.type}-${feature.xMin.toFixed(0)}`;
            if (!loggedProfiles.current.has(logKey)) {
                loggedProfiles.current.add(logKey);

                const logContent = `[EVENT] Type: ${feature.type} | Timestamp: ${timestamp} | Confidence: ${feature.confidence} | Bounds: [${feature.xMin.toFixed(1)}, ${feature.xMax.toFixed(1)}] @ [${feature.zMin.toFixed(1)}, ${feature.zMax.toFixed(1)}]`;

                // Invoke electron API
                if (window.electronAPI) {
                    window.electronAPI.appendLog({
                        filePath: 'detections_log.txt',
                        content: logContent
                    }).then(res => {
                        if (res.success) {
                            setLastDetectionLog(new Date().toLocaleTimeString());
                        }
                    });
                } else {
                    console.log('Log entry (browser mode):', logContent);
                    setLastDetectionLog(new Date().toLocaleTimeString());
                }
            }
        });
    }, [featuresEnabled, featuresResult, selectedProfile, binData]);

    const handleLabelFeature = useCallback((feature, isCorrect) => {
        if (!window.electronAPI || !binData) return;

        const currentProfile = binData.profiles[selectedProfile];

        // Extract the exact 3D points belonging to this feature
        const featurePoints = feature.indices.map(idx => ({
            x: profile3D[idx].x,
            z: profile3D[idx].z
        }));

        const labelData = {
            profileIndex: selectedProfile,
            fileName: fileName,
            timestamp: currentProfile.comment?.timestamp,
            // Full context for preprocessing neighbors and pipe distance
            profile3D: profile3D.map(p => ({ x: p.x, z: p.z })),
            pipeResult: pipeResult,
            featurePoints: featurePoints,
            triangulationParams: derivedParams,
            feature: feature, // Keep indices!
            isCorrect: isCorrect,
            paramsUsed: featureParams,
            labeledAt: new Date().toISOString()
        };

        window.electronAPI.appendLog({
            filePath: 'training_data.json',
            content: JSON.stringify(labelData)
        }).then(res => {
            if (res.success) {
                alert(isCorrect ? 'Marked as Correct. Feature signature saved.' : 'Marked as False Positive. Context saved.');
            }
        });
    }, [selectedProfile, binData, fileName, profile3D, derivedParams, featureParams, pipeResult]);

    // ---- ML PNG Export Effect ----
    useEffect(() => {
        window.onTriggerExportPNGs = async () => {
            if (!binData || !window.electronAPI) {
                alert("Cannot export: No file loaded or Electron API missing.");
                return;
            }

            const confirm = window.confirm(`This will play through ${binData.profileCount} profiles and export a 2048x1152 PNG for each into your "Documents > Laser Analyzer Data > ml_dataset" folder. This may take a few moments. Proceed?`);
            if (!confirm) return;

            // Store original states
            const originalProfile = selectedProfile;
            const originalPipeEnabled = pipeEnabled;
            const originalFeaturesEnabled = featuresEnabled;

            // Disable overlays for pure data capture
            setPipeEnabled(false);
            setFeaturesEnabled(false);

            alert("Export started. Please wait...");

            // Select the precise X-Z Canvas from the DOM and force it to 2048x1152
            const canvases = document.querySelectorAll('canvas');
            let targetCanvas = canvases[canvases.length - 1]; // X-Z Canvas
            let container = targetCanvas ? targetCanvas.parentElement : null;
            let origStyles = {};

            if (container) {
                origStyles = {
                    position: container.style.position,
                    width: container.style.width,
                    height: container.style.height,
                    zIndex: container.style.zIndex,
                    top: container.style.top,
                    left: container.style.left
                };

                // Force full resolution rendering
                container.style.position = 'fixed';
                container.style.top = '0px';
                container.style.left = '0px';
                container.style.width = '2048px';
                container.style.height = '1152px';
                container.style.zIndex = '9999';
                window.dispatchEvent(new Event('resize'));
                await new Promise(resolve => setTimeout(resolve, 300)); // wait for layout & WebGL buffers to reset
            }

            for (let i = 0; i < binData.profileCount; i++) {
                // Yield to React to render the canvas
                setSelectedProfile(i);
                await new Promise(resolve => setTimeout(resolve, 60)); // Allow render to complete

                if (!targetCanvas) continue;

                try {
                    const base64Data = targetCanvas.toDataURL('image/png');
                    const profile = binData.profiles[i];

                    // Windows filename restrictions: Cannot use ":" in paths.
                    // Replace colons with dashes, keep everything else exactly as acquisition 
                    let timestampStr = profile?.comment?.acquisition?.time?.replace(/:/g, '-') || `profile_${i.toString().padStart(4, '0')}`;
                    const filename = `${timestampStr}.png`;

                    await window.electronAPI.saveImageSequence({
                        folderPath: 'ml_dataset',
                        filename: filename,
                        base64Data: base64Data
                    });
                } catch (err) {
                    console.error("Failed to export profile:", i, err);
                }
            }

            // Restore original DOM state
            if (container) {
                container.style.position = origStyles.position;
                container.style.top = origStyles.top;
                container.style.left = origStyles.left;
                container.style.width = origStyles.width;
                container.style.height = origStyles.height;
                container.style.zIndex = origStyles.zIndex;
                window.dispatchEvent(new Event('resize'));
            }

            // Restore original visualizer states
            setPipeEnabled(originalPipeEnabled);
            setFeaturesEnabled(originalFeaturesEnabled);
            setSelectedProfile(originalProfile);

            alert(`Export complete! Saved ${binData.profileCount} images (2048x1152) to "Documents > Laser Analyzer Data > ml_dataset".`);
        };

        return () => {
            delete window.onTriggerExportPNGs;
        };
    }, [binData, selectedProfile, pipeEnabled, featuresEnabled]);

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

                {/* Object detection */}
                <ObjectDetectionPanel
                    enabled={featuresEnabled}
                    onToggle={setFeaturesEnabled}
                    pointCleaningEnabled={pointCleaningEnabled}
                    onPointCleaningToggle={setPointCleaningEnabled}
                    pointCleaningParams={pointCleaningParams}
                    onPointCleaningParamsChange={setPointCleaningParams}
                    detectedFeatures={featuresResult}
                    lastLogTime={lastDetectionLog}
                    params={featureParams}
                    onParamsChange={setFeatureParams}
                    onLabelFeature={handleLabelFeature}
                    onHoverFeature={setHoveredFeature}
                />

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
                        v1.1.0 · Laser Analyzer
                    </p>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
                <Viewer3D
                    points={profile3D}
                    pipeResult={pipeResult}
                    features={featuresResult}
                    params={derivedParams}
                    highlightedFeature={hoveredFeature}
                />
            </div>
        </div>
    );
}
