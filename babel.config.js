module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // Hermes V1 opt-out, transpile half (see plugins/withHermesV1Disabled.js):
      // the app runs Hermes 0.16.0 (HBC bytecode 96). RN 0.85's default
      // 'hermes-stable' profile targets Hermes V1 and preserves class syntax and
      // private members, which hermesc 0.16.0 cannot compile ("invalid statement
      // encountered" / "private properties are not supported") — and when hermesc
      // fails, the Xcode bundle phase silently keeps the PREVIOUS bundle, which is
      // how iOS builds 5/6 shipped V1 bytecode and aborted at launch with "Wrong
      // bytecode version. Expected 96 but got 98". 'hermes-v0' selects
      // babel-preset-expo's old-Hermes pipeline on both platforms.
      ['babel-preset-expo', { unstable_transformProfile: 'hermes-v0' }],
    ],
    // react-native-worklets/plugin must be listed last (Reanimated 4 requirement).
    plugins: ['react-native-worklets/plugin'],
  };
};
