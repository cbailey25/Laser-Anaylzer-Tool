import json
import numpy as np
import os

def triangulate(col, row, params):
    # Port of the JS triangulate2Dto3D logic to Python
    focal_length = params.get('focalLength', 24)
    pixel_size = params.get('pixelSize', 11) / 1000.0 # mm to m? Wait, pixels are usually microns
    # Actually, let's keep it simple: just use the pixel coords for now 
    # but shift them by the feature location.
    return col, row

def preprocess_feature(entry, n_samples=64, n_context=10):
    """
    Normalizes a set of laser points into a fixed-length feature vector with context.
    Vector structure: [64 pts feature (128)] + [10 pts left (20)] + [10 pts right (20)] + [pipe dist (1)] = 169
    """
    feature_meta = entry.get('feature', {})
    indices = feature_meta.get('indices', [])
    profile = entry.get('profile3D', [])
    pipe = entry.get('pipeResult', {})
    
    # 1. Extract Central Feature
    X_feat = []
    Z_feat = []
    
    if 'featurePoints' in entry and not indices:
        # Fallback for very old format or simplified extraction
        pts = entry['featurePoints']
        X_feat = [p['x'] for p in pts]
        Z_feat = [p['z'] for p in pts]
    elif indices and profile:
        X_feat = [profile[i]['x'] for i in indices]
        Z_feat = [profile[i]['z'] for i in indices]
    else:
        # Cannot process without profile context and indices for the new model
        return None

    if len(X_feat) < 5:
        return None

    # --- FEATURE NORMALIZATION ---
    x_arr = np.array(X_feat, dtype=float)
    z_arr = np.array(Z_feat, dtype=float)
    x_mean, z_mean = np.mean(x_arr), np.mean(z_arr)
    
    x_centered = x_arr - x_mean
    z_centered = z_arr - z_mean
    
    max_dim = max(np.max(np.abs(x_centered)), np.max(np.abs(z_centered)), 1.0)
    x_norm = x_centered / max_dim
    z_norm = z_centered / max_dim
    
    # Resample feature to 64 points
    old_idx = np.linspace(0, 1, len(x_norm))
    new_idx = np.linspace(0, 1, n_samples)
    feat_x = np.interp(new_idx, old_idx, x_norm)
    feat_z = np.interp(new_idx, old_idx, z_norm)
    feature_vec = np.column_stack((feat_x, feat_z)).flatten()

    # 2. Extract Context (Neighbors)
    left_vec = np.zeros(n_context * 2)
    right_vec = np.zeros(n_context * 2)
    
    if indices and profile:
        start_idx = indices[0]
        end_idx = indices[-1]
        
        # Left context
        l_ctx = []
        for i in range(max(0, start_idx - n_context), start_idx):
            l_ctx.append([(profile[i]['x'] - x_mean)/max_dim, (profile[i]['z'] - z_mean)/max_dim])
        if l_ctx:
            l_ctx = np.array(l_ctx).flatten()
            left_vec[:len(l_ctx)] = l_ctx
            
        # Right context
        r_ctx = []
        for i in range(end_idx + 1, min(len(profile), end_idx + 1 + n_context)):
            r_ctx.append([(profile[i]['x'] - x_mean)/max_dim, (profile[i]['z'] - z_mean)/max_dim])
        if r_ctx:
            r_ctx = np.array(r_ctx).flatten()
            right_vec[:len(r_ctx)] = r_ctx

    # 3. Radial Pipe Distance
    # Normalized: (Dist - Radius) / Radius. 0 = on pipe, >0 = off pipe.
    radial_dist = 1.0 # Default to "far" if no pipe
    if pipe and 'cx' in pipe:
        dist = np.sqrt((x_mean - pipe['cx'])**2 + (z_mean - pipe['cz'])**2)
        radius = pipe.get('radius', 250)
        radial_dist = (dist - radius) / radius

    return np.concatenate([feature_vec, left_vec, right_vec, [radial_dist]])

def load_and_prepare_data(json_path):
    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found.")
        return None, None

    with open(json_path, 'r') as f:
        # Assuming entries are appended line by line or as a list
        content = f.read()
        try:
            # Handle multiple JSON objects appended to one file
            data = [json.loads(line) for line in content.strip().split('\n') if line.strip()]
        except:
            data = json.loads(content)

    X = []
    y = []
    
    label_map = {'Anode': 0, 'Rock': 1, 'Freespan': 2}
    
    for entry in data:
        if not entry.get('isCorrect', True):
            continue
            
        # Validate that the entry has the necessary data for training
        if 'rawPoints' not in entry or 'feature' not in entry:
            print(f"Skipping entry (missing rawPoints or feature metadata): {entry.get('timestamp', 'unknown')}")
            continue
            
        feature_vector = preprocess_feature(entry)
        if feature_vector is not None:
            X.append(feature_vector)
            y.append(label_map.get(entry['feature']['type'], -1))
        else:
            print(f"Skipping entry (insufficient clean points): {entry.get('timestamp', 'unknown')}")
        
    # Filter out any entries that mapped to unknown classes
    X = np.array(X)
    y = np.array(y)
    valid_mask = y != -1
    
    return X[valid_mask], y[valid_mask]

if __name__ == "__main__":
    # Example usage
    X, y = load_and_prepare_data('../training_data.json')
    if X is not None:
        print(f"Prepared {len(X)} samples for training.")
        np.save('data/X_train.npy', X)
        np.save('data/y_train.npy', y)
