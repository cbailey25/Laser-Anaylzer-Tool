import tensorflow as tf
from tensorflow.keras import layers, models
import numpy as np
import os

def build_model(input_shape, num_classes):
    model = models.Sequential([
        layers.Input(shape=input_shape),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(64, activation='relu'),
        layers.Dense(num_classes, activation='softmax')
    ])
    
    model.compile(optimizer='adam',
                  loss='sparse_categorical_crossentropy',
                  metrics=['accuracy'])
    return model

def main():
    # Load processed data
    if not os.path.exists('data/X_train.npy'):
        print("Run preprocess.py first.")
        return

    X = np.load('data/X_train.npy')
    y = np.load('data/y_train.npy')

    # Basic train/test split
    indices = np.arange(len(X))
    np.random.shuffle(indices)
    split = int(0.8 * len(X))
    
    X_train, X_test = X[indices[:split]], X[indices[split:]]
    y_train, y_test = y[indices[:split]], y[indices[split:]]

    print(f"Training on {len(X_train)} samples...")
    model = build_model((X.shape[1],), 3) # 3 classes: Anode, Rock, Freespan
    
    model.fit(X_train, y_train, epochs=50, batch_size=16, validation_data=(X_test, y_test))

    # Save Native Model
    # Both H5 and the newer .keras format
    model.save('models/laser_feature_model.h5')
    model.save('models/laser_feature_model.keras')
    print("Native models saved to 'models/' directory.")
    
    # EXPORT TO WEB FORMAT (TensorFlow.js)
    try:
        import tensorflowjs as tfjs
        print("Exporting to TensorFlow.js format...")
        tfjs.converters.save_keras_model(model, 'models/tfjs_model')
        print("Done! Copy the contents of 'models/tfjs_model' to your web app's public folder.")
    except ImportError:
        print("\n[NOTE] 'tensorflowjs' library is missing. Skipping local web conversion.")
        print("You can convert the 'laser_feature_model.h5' to web format later")
        print("using a separate command or by installing tensorflowjs in a cleaner environment.")

if __name__ == "__main__":
    main()
