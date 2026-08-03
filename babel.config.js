/**
 * Babel config.
 *
 * Exists solely for the worklets plugin. Vision-camera frame processors run the
 * detection callback on a separate native thread, and the plugin is what
 * compiles those functions into worklets — without it a frame processor throws
 * at runtime rather than failing to build, which is a confusing way to find out
 * it is missing.
 *
 * `babel-preset-expo` is what Expo applies by default; naming it here keeps that
 * behaviour unchanged now that an explicit config file exists.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets-core/plugin'],
  };
};
