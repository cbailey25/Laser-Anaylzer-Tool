import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';

async function convert() {
    console.log('Loading Keras model...');
    // Note: Node.js version of TFJS usually expects a manifest, 
    // but here we just want to show the user how to bundle it.
    // Since we are in an Electron environment, the USER can just use 
    // the H5 model directly if they have the right backend, 
    // but typically we want the JSON format for the Browser process.

    console.log('NOTE: To convert .h5 to .json on Windows without uvloop:');
    console.log('1. Use the web-based converter at https://tensorflow.github.io/tfjs-converter/visualizer/');
    console.log('2. OR use a Docker container with: docker run -it -v ${PWD}:/worker tensorflow/tensorflow:latest-py3 pip install tensorflowjs; tensorflowjs_converter --input_format keras /worker/models/laser_feature_model.h5 /worker/models/tfjs_model');
}

convert();
