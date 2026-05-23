import { CapacitorConfig } from '@capacitor/cli';

// EA-CENTRAL Bubble wrapper.
// We point the WebView straight at the live PWA (recommended for OTA updates).
// Switch to a bundled /public/index.html build only if you want offline-first.
const config: CapacitorConfig = {
  appId: 'com.eacentral.bubble',
  appName: 'EA-CENTRAL',
  webDir: 'web',
  server: {
    // CHANGE THIS to your deployed PWA URL once you save-to-github + push to VPS.
    // Example: 'https://ea-central.co.za/app'
    url: 'https://ea-central.preview.emergentagent.com/app',
    cleartext: false,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
