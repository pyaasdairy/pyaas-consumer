// PYAAS consumer — Metro config.
//
// The only non-default we set: allowOptionalDependencies. It lets us `require()`
// a native-only module that may NOT be installed yet (react-native-razorpay,
// which needs a dev build) from inside a try/catch WITHOUT failing the bundle.
// A missing optional module becomes a runtime throw our loader catches, so the
// app still builds + runs (falling back to the WebView / mock checkout) in Expo
// Go and before the founder adds the package. See lib/razorpay.ts.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.transformer = {
  ...config.transformer,
  allowOptionalDependencies: true,
};

module.exports = config;
