import { CapacitorConfig } from '@capacitor/cli';

// EA-CENTRAL Mobile EA — plain WebView wrapper.
// We point the WebView straight at the live PWA so the app updates over-the-air
// every time you redeploy the website. No need to push a new APK for every change.
const config: CapacitorConfig = {
  appId: 'com.eacentral.app',
  appName: 'EA-CENTRAL',
  webDir: 'web',
  server: {
    // CHANGE THIS to your production /app URL before building.
    url: 'https://ea-central.preview.emergentagent.com/app',
    cleartext: false,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;
