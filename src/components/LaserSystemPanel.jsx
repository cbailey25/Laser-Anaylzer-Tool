import React from 'react';

/**
 * LaserSystemPanel — configuration inputs for the laser triangulation system.
 */
export default function LaserSystemPanel({ params, onChange }) {
    const handleChange = (key) => (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
            onChange({ ...params, [key]: val });
        }
    };

    const renderGroup = (title, fields) => (
        <div style={{ marginBottom: 'var(--space-md)' }}>
            <div className="form-label" style={{ color: 'var(--accent-blue)', marginBottom: 'var(--space-xs)' }}>
                {title}
            </div>
            {fields.map(({ key, label, unit, step }) => (
                <div className="form-group" key={key} style={{ marginBottom: 'var(--space-xs)' }}>
                    <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
                        {label}
                        <span className="form-unit">{unit}</span>
                    </label>
                    <input
                        id={`input-${key}`}
                        className="form-input"
                        type="number"
                        step={step}
                        value={params[key]}
                        onChange={handleChange(key)}
                        style={{ padding: '4px 8px', fontSize: 'var(--font-size-sm)' }}
                    />
                </div>
            ))}
        </div>
    );

    const triangParams = [
        { key: 'dlc', label: 'Camera–Laser Dist', unit: 'mm', step: 1 },
        { key: 'focalLength', label: 'Focal Length', unit: 'mm', step: 0.1 },
        { key: 'pixelSize', label: 'Pixel Size', unit: 'µm', step: 0.1 },
        { key: 'imageWidth', label: 'Image Width', unit: 'px', step: 1 },
    ];

    const camParams = [
        { key: 'camX', label: 'X', unit: 'mm', step: 1 },
        { key: 'camY', label: 'Y', unit: 'mm', step: 1 },
        { key: 'camZ', label: 'Z', unit: 'mm', step: 1 },
        { key: 'camPitch', label: 'Pitch (X)', unit: '°', step: 1 },
        { key: 'camRoll', label: 'Roll (Y)', unit: '°', step: 1 },
        { key: 'camYaw', label: 'Yaw (Z)', unit: '°', step: 1 },
    ];

    const laserParams = [
        { key: 'laserX', label: 'X', unit: 'mm', step: 1 },
        { key: 'laserY', label: 'Y', unit: 'mm', step: 1 },
        { key: 'laserZ', label: 'Z', unit: 'mm', step: 1 },
        { key: 'laserPitch', label: 'Pitch (X)', unit: '°', step: 1 },
        { key: 'laserRoll', label: 'Roll (Y)', unit: '°', step: 1 },
        { key: 'laserYaw', label: 'Yaw (Z)', unit: '°', step: 1 },
    ];

    return (
        <div className="panel">
            <div className="panel-header" style={{ marginBottom: 'var(--space-sm)' }}>
                <div className="panel-icon laser">⟁</div>
                <span className="panel-title">System Settings</span>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
                {renderGroup('Triangulation', triangParams)}
                {renderGroup('Camera Pose', camParams)}
                {renderGroup('Laser Pose', laserParams)}
            </div>
        </div>
    );
}
