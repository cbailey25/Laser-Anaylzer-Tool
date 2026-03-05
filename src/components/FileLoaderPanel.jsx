import React, { useRef, useState } from 'react';

/**
 * FileLoaderPanel — UI for loading .bin laser files and selecting profiles.
 */
export default function FileLoaderPanel({
    onFileLoaded,
    fileInfo,
    selectedProfile,
    onProfileChange,
    onClearFile,
}) {
    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState(null);

    const handleFile = async (file) => {
        if (!file) return;
        setError(null);
        try {
            if (!file.name.toLowerCase().endsWith('.bin')) {
                throw new Error('Please select a .bin file.');
            }
            const buffer = await file.arrayBuffer();
            onFileLoaded(buffer, file.name);
        } catch (e) {
            setError(e.message);
        }
    };

    const handleInputChange = (e) => {
        handleFile(e.target.files[0]);
        // Reset input so the same file can be re-selected
        e.target.value = '';
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        handleFile(file);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    return (
        <div className="panel">
            <div className="panel-header">
                <div className="panel-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>📂</div>
                <span className="panel-title">Load Laser Data</span>
            </div>

            {/* Drop zone / Load button */}
            <div
                className={`drop-zone ${isDragging ? 'dragging' : ''} ${fileInfo ? 'has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".bin"
                    onChange={handleInputChange}
                    style={{ display: 'none' }}
                />
                {fileInfo ? (
                    <div className="drop-zone-loaded">
                        <span className="drop-zone-filename">{fileInfo.fileName}</span>
                        <span className="drop-zone-meta">
                            {fileInfo.profileCount} profile{fileInfo.profileCount !== 1 ? 's' : ''} · {fileInfo.pointsPerProfile} pts/profile
                        </span>
                    </div>
                ) : (
                    <div className="drop-zone-empty">
                        <span className="drop-zone-icon">⬆</span>
                        <span className="drop-zone-text">Click or drag .bin file</span>
                    </div>
                )}
            </div>

            {/* Error display */}
            {error && (
                <div className="file-error">{error}</div>
            )}

            {/* Profile selector */}
            {fileInfo && fileInfo.profileCount > 1 && (
                <div className="form-group" style={{ marginTop: 'var(--space-md)' }}>
                    <label className="form-label">
                        Profile Selection
                        <span className="form-unit">{selectedProfile + 1} / {fileInfo.profileCount}</span>
                    </label>
                    <input
                        type="range"
                        className="profile-slider"
                        min={0}
                        max={fileInfo.profileCount - 1}
                        step={1}
                        value={selectedProfile}
                        onChange={(e) => onProfileChange(parseInt(e.target.value))}
                    />
                    <div className="step-button-group">
                        <button
                            className="step-btn"
                            disabled={selectedProfile === 0}
                            onClick={() => onProfileChange(selectedProfile - 1)}
                        >
                            ◀ Prev
                        </button>
                        <button
                            className="step-btn"
                            disabled={selectedProfile === fileInfo.profileCount - 1}
                            onClick={() => onProfileChange(selectedProfile + 1)}
                        >
                            Next ▶
                        </button>
                    </div>
                </div>
            )}

            {/* Profile Metadata */}
            {fileInfo && fileInfo.currentComment && (
                <div className="results-section" style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border-subtle)' }}>
                    <div className="result-row">
                        <span className="result-label">Acquisition Timestamp</span>
                    </div>
                    <div style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: 'var(--accent-orange)',
                        background: 'rgba(245, 158, 11, 0.05)',
                        padding: '8px',
                        borderRadius: '4px',
                        marginTop: '4px',
                        border: '1px solid rgba(245, 158, 11, 0.1)'
                    }}>
                        {fileInfo.currentComment.acquisition?.time || 'N/A'}
                    </div>
                </div>
            )}
            {/* Export To PNG Sequence for ML dataset gathering */}
            {fileInfo && fileInfo.profileCount > 1 && (
                <div style={{ marginTop: 'var(--space-md)' }}>
                    <button className="primary-btn" onClick={() => {
                        if (window.onTriggerExportPNGs) {
                            window.onTriggerExportPNGs();
                        } else {
                            alert("PNG sequence export is not registered. (Wait for UI to load)");
                        }
                    }} style={{ width: '100%', marginBottom: 'var(--space-sm)' }}>
                        ⬇ Export PNG Sequence
                    </button>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Creates {fileInfo.profileCount} images (2048x1152) of raw cross-sections
                    </div>
                </div>
            )}

            {/* Clear button */}
            {fileInfo && (
                <button className="clear-btn" onClick={(e) => { e.stopPropagation(); onClearFile(); }}>
                    ✕ Clear File (Use Demo)
                </button>
            )}
        </div>
    );
}
