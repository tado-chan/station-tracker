import { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.stationtracker.app',
  appName: '駅記録アプリ',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Geolocation: {
      permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
      backgroundLocationIndicator: true,
      foregroundService: {
        body: "駅への到着・出発を記録中です",
        notification: "位置情報を使用中"
      }
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#488AFF",
      sound: "beep.wav",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    BackgroundMode: {
      enabled: true,
      title: "駅記録アプリ",
      text: "バックグラウンドで位置を追跡中...",
      silent: false,
      resume: true
    }
  }
};

export default config;