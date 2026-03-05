import React from 'react';

/**
 * ObjectDetectionPanel — configure and monitor automated feature detection.
 */
export default function ObjectDetectionPanel({
    enabled,
    onToggle,
    pointCleaningEnabled,
    onPointCleaningToggle,
    pointCleaningParams,
    onPointCleaningParamsChange,
    detectionStatus,
    detectedFeatures = [],
    lastLogTime,
    logFile = 'detections_log.txt',
    params,
    onParamsChange,
    onLabelFeature
}) {
    return (
        <div className="panel">
            <div className="panel-header">
                <div className="panel-icon laser" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>◎</div>
                <span className="panel-title">Feature Detector</span>
            </div>

            {/* Enable / disable toggle */}
            <div className="toggle-row">
                <span className="toggle-label">Auto-Detect Features</span>
                <label className="toggle-switch">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => onToggle(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                </label>
            </div>

            {/* Point Cleaning Section */}
            <div className="toggle-row">
                <span className="toggle-label">Point Cleaning (Reduce Noise)</span>
                <label className="toggle-switch">
                    <input
                        type="checkbox"
                        checked={pointCleaningEnabled}
                        onChange={(e) => onPointCleaningToggle(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                </label>
            </div>

            {pointCleaningEnabled && pointCleaningParams && (
                <div style={{ marginTop: 'var(--space-xs)', marginBottom: 'var(--space-md)', padding: 'var(--space-sm)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
                    <div className="form-group" style={{ marginBottom: 'var(--space-sm)' }}>
                        <div className="form-label">Search Radius <span className="form-unit">{pointCleaningParams.radius}mm</span></div>
                        <input
                            type="range" min="1" max="50" step="1"
                            value={pointCleaningParams.radius}
                            onChange={(e) => onPointCleaningParamsChange({ ...pointCleaningParams, radius: parseInt(e.target.value) })}
                            className="profile-slider"
                        />
                    </div>
                    <div className="form-group">
                        <div className="form-label">Min Neighbors <span className="form-unit">{pointCleaningParams.minNeighbors} points</span></div>
                        <input
                            type="range" min="1" max="10" step="1"
                            value={pointCleaningParams.minNeighbors}
                            onChange={(e) => onPointCleaningParamsChange({ ...pointCleaningParams, minNeighbors: parseInt(e.target.value) })}
                            className="profile-slider"
                        />
                    </div>
                </div>
            )}

            {/* Tuning Parameters */}
            {enabled && (
                <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
                    <div className="form-label" style={{ fontSize: '11px', color: 'var(--accent-orange)' }}>Tuning (Reduce False Positives)</div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-sm)' }}>
                        <div className="form-label">Min Height <span className="form-unit">{params.minHeight}mm</span></div>
                        <input
                            type="range" min="5" max="100" step="1"
                            value={params.minHeight}
                            onChange={(e) => onParamsChange({ ...params, minHeight: parseInt(e.target.value) })}
                            className="profile-slider"
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-sm)' }}>
                        <div className="form-label">Min Width <span className="form-unit">{params.minWidth}mm</span></div>
                        <input
                            type="range" min="10" max="200" step="5"
                            value={params.minWidth}
                            onChange={(e) => onParamsChange({ ...params, minWidth: parseInt(e.target.value) })}
                            className="profile-slider"
                        />
                    </div>
                </div>
            )}

            {/* Status section */}
            {enabled && (
                <div className="results-section">
                    <div className="result-row">
                        <span className="result-label">Status</span>
                        {detectedFeatures.length > 0 ? (
                            <span className="result-badge detected">● {detectedFeatures.length} Found</span>
                        ) : (
                            <span className="result-badge not-detected">○ Scanning</span>
                        )}
                    </div>

                    <div className="result-row">
                        <span className="result-label">Log File</span>
                        <span className="result-value" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{logFile}</span>
                    </div>

                    {lastLogTime && (
                        <div className="result-row">
                            <span className="result-label">Last Event</span>
                            <span className="result-value">{lastLogTime}</span>
                        </div>
                    )}

                    {detectedFeatures.length > 0 && (
                        <div style={{ marginTop: 'var(--space-sm)' }}>
                            <div className="form-label" style={{ marginBottom: 'var(--space-xs)' }}>Found Features (Help Train):</div>
                            {detectedFeatures.map((f, i) => (
                                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }}>
                                    <div className="result-row" style={{ fontSize: '11px' }}>
                                        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{f.type}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{(f.confidence * 100).toFixed(0)}% conf</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                        <button
                                            className="step-btn"
                                            style={{ color: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.2)', fontSize: '9px', padding: '2px 4px' }}
                                            onClick={() => onLabelFeature(f, true)}
                                        >
                                            ✓ Correct
                                        </button>
                                        <button
                                            className="step-btn"
                                            style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', fontSize: '9px', padding: '2px 4px' }}
                                            onClick={() => onLabelFeature(f, false)}
                                        >
                                            ✗ False Positive
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

