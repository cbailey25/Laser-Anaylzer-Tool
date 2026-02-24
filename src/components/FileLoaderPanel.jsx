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
                        Profile
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
                </div>
            )}

            {/* Profile comment info */}
            {fileInfo && fileInfo.currentComment && (
                <div className="file-comment">
                    {Object.entries(fileInfo.currentComment).slice(0, 6).map(([key, val]) => (
                        <div className="result-row" key={key}>
                            <span className="result-label">{key}</span>
                            <span className="result-value" style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {typeof val === 'number' ? val.toFixed?.(2) ?? val : String(val)}
                            </span>
                        </div>
                    ))}
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
