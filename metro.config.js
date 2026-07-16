const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `.tflite` model files are bundled as static assets (loaded via require()) for
// the on-device face-recognition models — see src/shared/services/faceMatch/tflite/.
config.resolver.assetExts.push('tflite');

module.exports = config;
