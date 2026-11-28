// v1.68 telefon uygulaması (Android + iPhone). Arayüz masaüstüyle aynı React kodu: `npm run build:mobil` → dist/mobil
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xanaphian.app',
  appName: 'Naphian',
  webDir: 'dist/mobil',
  backgroundColor: '#0f1115',
  android: {
    // eski yerel sunuculara (http://ip:port) bağlanabilsin
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#0f1115',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_xanaphian',
      iconColor: '#c8aa6e',
    },
  },
};

export default config;
