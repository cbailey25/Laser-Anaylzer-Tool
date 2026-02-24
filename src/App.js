import React from 'react';
import ReactDOM from 'react-dom/client';
import Viewer3D from './components/Viewer3D';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <Viewer3D />
    </React.StrictMode>,
);
