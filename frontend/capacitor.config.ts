import { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.stationtracker.app',
  appName: '駅記録アプリ',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    BackgroundGeolocation: {
      notificationTitle: "駅記録アプリ",
      notificationText: "バックグラウンドで位置を追跡中",
      notificationChannelName: "Background Location",
      requestPermissions: true,
      stale: false,
      distanceFilter: 10
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#488AFF",
      sound: "beep.wav",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    }
  }
};

export default config;