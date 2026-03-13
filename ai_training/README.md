# Laser Feature AI Training

This project is designed to train a classification model using annotations from the **Laser Feature Visualiser**.

## Project Workflow

1.  **Annotate**: Use the "Laser Feature Visualiser" UI to mark features as "Correct" or "False Positive".
2.  **Preprocess**: Run `python scripts/preprocess.py` to convert the `training_data.json` into normalized feature vectors.
3.  **Train**: Run `python scripts/train.py` to train a Neural Network and export it to **TensorFlow.js** format.
4.  **Deploy**: Move the exported `models/tfjs_model` folder into the main application's `public/` directory.

## Requirements

Ensure you have Python 3.8+ installed.
```bash
pip install -r requirements.txt
```

## Data Format
The model uses **Resampled 2D Geometry**. 
- It takes the raw pixel columns/rows from the laser scan.
- It resamples them to a fixed size of 64 points.
- This creates a shape-invariant signature that can identify objects regardless of their distance from the camera.

## Integration
The main application is already configured with an `async classifyWithML` hook in `src/utils/featureDetection.js`. 
Once you move the model into the `public/` folder, you can load it in the JS code using:
```javascript
const model = await tf.loadLayersModel('/tfjs_model/model.json');
```
