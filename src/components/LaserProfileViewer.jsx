import React, { useState, useEffect, useCallback } from 'react';
import Viewer3D from './Viewer3D';
import { triangulate2Dto3D } from '../utils/triangulation';
import { profileToPixelCoords } from '../utils/binParser';

const LaserProfileViewer = ({ filePath }) => {
  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);

  // Default laser system parameters (matching the ones in App.jsx)
  const [params, setParams] = useState({
    dlc: 150,           // mm — distance laser to camera
    theta: 30,          // degrees — angle between camera axis and laser plane
    focalLength: 12,    // mm
    pixelSize: 5.5,     // µm
    imageWidth: 2048,   // pixels
  });

  // Handle file selection
  const handleFileChange = useCallback((e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  }, []);

  // Parse the binary file and extract profile data
  useEffect(() => {
    if (!file) return;
    
    const parseLaserFile = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const view = new DataView(arrayBuffer);
        
        console.log('File size:', arrayBuffer.byteLength, 'bytes');

        // Parse header
        const header = {
          format: view.getUint8(0),
          version: view.getUint8(1),
          headerByteLength: view.getUint16(2, true), // little endian
          pointCount: view.getUint16(4, true),      // little endian
          reserved0: view.getUint16(6, true),       // little endian
          reserved1: view.getUint16(8, true)        // little endian
        };

        // Parse profile data
        const profile = parseProfile(view, header.headerByteLength, header.pointCount);
        
        // Create a profile object that matches the expected format
        const profileObj = {
          points: profile.points,
          validCount: profile.points.filter(p => p.valid).length
        };
        
        // Use the updated profileToPixelCoords function with interpolation
        const { pixelColumns, pixelRows } = profileToPixelCoords(profileObj, params.imageWidth || 2048);
        
        const points3D = triangulate2Dto3D(
          pixelColumns,
          pixelRows,
          params.dlc,
          params.theta * (Math.PI / 180), // Convert to radians
          params.focalLength,
          params.pixelSize / 1000, // Convert µm to mm
          params.imageWidth
        );

        setProfileData({
          header,
          profile: {
            ...profile,
            points3D
          }
        });
        setIsLoading(false);
      } catch (err) {
        console.error('Error parsing laser file:', err);
        setError('Failed to parse laser file');
        setIsLoading(false);
      }
    };

    parseLaserFile();
  }, [file, params]);

  // Parse a single profile from the binary data
  const parseProfile = (view, offset, pointCount) => {
    const jsonLength = view.getUint16(offset, true);
    offset += 2;
    
    // Read JSON string
    const jsonStr = String.fromCharCode(...Array.from(new Uint8Array(view.buffer, offset, jsonLength)));
    offset += jsonLength;
    
    const points = [];
    
    // Read points
    for (let i = 0; i < pointCount; i++) {
      const yOffset = view.getUint16(offset, true);
      const intensity = view.getUint8(offset + 2);
      const width = view.getUint8(offset + 3);
      offset += 4;
      
      points.push({
        yOffset: yOffset / 16.0, // Convert 12.4 fixed point to float
        intensity,
        width,
        valid: width > 0
      });
    }
    
    return {
      json: jsonStr,
      points: points.filter(p => p.valid) // Only keep valid points
    };
  };

  if (isLoading) {
    return <div className="loading">Loading laser profile data...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!profileData) {
    return <div className="no-data">No profile data available</div>;
  }

  return (
    <div className="laser-profile-viewer" style={{ padding: '1rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3>Laser Profile Viewer</h3>
        <input 
          type="file" 
          accept=".bin" 
          onChange={handleFileChange}
          style={{ marginBottom: '1rem' }}
        />
        {file && <div>Selected file: {file.name}</div>}
      </div>

      {isLoading && <div>Loading laser profile data...</div>}
      
      {error && (
        <div style={{ color: 'red', margin: '1rem 0' }}>
          Error: {error}
        </div>
      )}
      
      {profileData && (
        <div className="viewer-container" style={{ height: '500px', border: '1px solid #ccc', borderRadius: '4px' }}>
          <Viewer3D 
            points={profileData.profile.points3D} 
            pipeResult={null} 
          />
          
          <div className="profile-info" style={{ marginTop: '1rem' }}>
            <h4>Profile Information</h4>
            <div>Points: {profileData.profile.points.length}</div>
            <div>File: {file.name}</div>
            <div style={{ marginTop: '0.5rem' }}>
              <strong>Header:</strong>
              <pre style={{ 
                background: '#f5f5f5', 
                padding: '0.5rem', 
                borderRadius: '4px',
                maxHeight: '200px',
                overflow: 'auto'
              }}>
                {JSON.stringify(profileData.header, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LaserProfileViewer;
