import React from 'react';

/**
 * PipeDetectionPanel — configure expected pipe diameter and view detection results.
 */
export default function PipeDetectionPanel({ enabled, onToggle, diameter, onDiameterChange, result }) {
    return (
        <div className="panel">
            <div className="panel-header">
                <div className="panel-icon pipe">⊚</div>
                <span className="panel-title">Pipe Detection</span>
            </div>

            {/* Enable / disable toggle */}
            <div className="toggle-row">
                <span className="toggle-label">Enable Detection</span>
                <label className="toggle-switch">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => onToggle(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                </label>
            </div>

            {/* Expected diameter input */}
            <div className="form-group" style={{ marginTop: 'var(--space-md)' }}>
                <label className="form-label">
                    Expected Diameter
                    <span className="form-unit">mm</span>
                </label>
                <input
                    id="input-pipe-diameter"
                    className="form-input"
                    type="number"
                    step={1}
                    value={diameter}
                    onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v > 0) onDiameterChange(v);
                    }}
                    disabled={!enabled}
                    style={{ opacity: enabled ? 1 : 0.4 }}
                />
            </div>

            {/* Results section */}
            {enabled && (
                <div className="results-section">
                    <div className="result-row">
                        <span className="result-label">Status</span>
                        {result ? (
                            <span className="result-badge detected">● Detected</span>
                        ) : (
                            <span className="result-badge not-detected">○ Not found</span>
                        )}
                    </div>

                    {result && (
                        <>
                            <div className="result-row">
                                <span className="result-label">Fitted Diameter</span>
                                <span className="result-value good">{result.diameter.toFixed(1)} mm</span>
                            </div>
                            <div className="result-row">
                                <span className="result-label">Centre X</span>
                                <span className="result-value">{result.cx.toFixed(1)} mm</span>
                            </div>
                            <div className="result-row">
                                <span className="result-label">Centre Z</span>
                                <span className="result-value">{result.cz.toFixed(1)} mm</span>
                            </div>
                            <div className="result-row">
                                <span className="result-label">RMS Residual</span>
                                <span className={`result-value ${result.rms < 2 ? 'good' : result.rms < 5 ? 'warn' : 'bad'}`}>
                                    {result.rms.toFixed(2)} mm
                                </span>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
