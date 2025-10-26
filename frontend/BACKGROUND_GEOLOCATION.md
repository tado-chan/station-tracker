# バックグラウンド位置情報トラッキング実装ガイド

## 概要

このプロジェクトでは `@capacitor-community/background-geolocation` を使用して、バックグラウンドでの位置情報取得とAWS Amazon Location Serviceへの送信を実装しています。

## 使用プラグイン

### @capacitor-community/background-geolocation

- **バージョン**: 1.2.26
- **リポジトリ**: https://github.com/capacitor-community/background-geolocation
- **特徴**:
  - ネイティブのバックグラウンド位置情報API使用
  - iOS/Android両対応
  - 電池効率が高い
  - distanceFilterで無駄な更新を削減

## インストール

### 1. 依存関係インストール

```bash
npm install @capacitor-community/background-geolocation
```

### 2. Capacitor同期

```bash
npx cap sync
```

## 設定

### Capacitor設定 (capacitor.config.ts)

```typescript
plugins: {
  BackgroundGeolocation: {
    notificationTitle: "駅記録アプリ",
    notificationText: "バックグラウンドで位置を追跡中",
    notificationChannelName: "Background Location",
    requestPermissions: true,
    stale: false,
    distanceFilter: 10  // 10m移動するたびに更新
  }
}
```

## 使用方法

### 基本的な開始方法

```typescript
import { GeolocationService } from './services/geolocation.service';

// トラッキング開始
await this.geolocationService.startBackgroundTracking();

// トラッキング停止
await this.geolocationService.stopBackgroundTracking();

// 位置情報を監視
this.geolocationService.getCurrentLocation().subscribe(location => {
  console.log('現在位置:', location);
});
```

### サービス実装 (geolocation.service.ts)

```typescript
async startBackgroundTracking() {
  this.watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: "駅への到着・出発を記録しています",
      backgroundTitle: "駅記録アプリ",
      requestPermissions: true,
      stale: false,
      distanceFilter: 10  // 10メートルごとに更新
    },
    (location?: Location, error?: any) => {
      if (location) {
        // 位置情報を受信
        this.currentLocation.next({
          latitude: location.latitude,
          longitude: location.longitude
        });

        // AWS APIに送信
        this.sendLocationToServer(
          location.latitude,
          location.longitude,
          new Date()
        );
      }
    }
  );
}
```

## iOS設定

### Info.plist

以下のキーを追加：

```xml
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>このアプリは駅への到着・出発を記録するために、バックグラウンドでの位置情報を使用します。</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>このアプリは近くの駅を表示するために位置情報を使用します。</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>このアプリは駅への到着・出発を記録するために、常に位置情報を使用します。</string>

<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
```

## Android設定

### AndroidManifest.xml

既に設定済み：

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

## AWS連携

### 位置情報送信

```typescript
private async sendLocationToServer(latitude: number, longitude: number, timestamp: Date) {
  const headers = new HttpHeaders({
    'Content-Type': 'application/json',
    'x-api-key': environment.api.apiKey
  });

  const body = {
    user_id: this.userId,
    lat: latitude,
    lng: longitude,
    timestamp: timestamp.toISOString()
  };

  const url = `${environment.api.baseUrl}${environment.api.endpoints.location}`;

  await this.http.post(url, body, { headers }).toPromise();
}
```

### environment.ts設定

```typescript
export const environment = {
  production: false,
  api: {
    baseUrl: 'https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com',
    apiKey: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    endpoints: {
      location: '/dev/location'
    }
  }
};
```

## データフロー

```
1. ユーザーが10m移動
   ↓
2. BackgroundGeolocation.addWatcher() がコールバック実行
   ↓
3. sendLocationToServer() が呼ばれる
   ↓
4. AWS API Gateway にPOST
   ↓
5. Lambda関数が実行
   ↓
6. Amazon Location Service でジオフェンス評価
   ↓
7. DynamoDBに訪問ログ保存
```

## トラブルシューティング

### 位置情報が取得できない

**iOS**:
1. 設定 → プライバシー → 位置情報サービス が有効か確認
2. アプリの位置情報権限が「常に」になっているか確認

**Android**:
1. 設定 → 位置情報 が有効か確認
2. アプリの位置情報権限が「常に許可」になっているか確認
3. バッテリー最適化から除外されているか確認

### バックグラウンドで動作しない

**iOS**:
- `UIBackgroundModes` に `location` が設定されているか確認
- バックグラウンド更新が有効か確認

**Android**:
- フォアグラウンドサービスの通知が表示されているか確認
- バッテリー最適化から除外されているか確認

### API送信エラー

1. `environment.ts` の API URL が正しいか確認
2. API Key が正しいか確認
3. ネットワーク接続があるか確認
4. CloudWatch Logsでエラー確認

## パフォーマンス最適化

### distanceFilter調整

```typescript
distanceFilter: 10  // 10m - 細かい追跡
distanceFilter: 50  // 50m - バランス型
distanceFilter: 100 // 100m - 電池節約
```

### 送信頻度制御

必要に応じて送信頻度を制限：

```typescript
private lastSentTime = 0;
private MIN_SEND_INTERVAL = 30000; // 30秒

private async sendLocationToServer(...) {
  const now = Date.now();
  if (now - this.lastSentTime < this.MIN_SEND_INTERVAL) {
    return; // 30秒以内は送信しない
  }
  this.lastSentTime = now;
  // ... 送信処理
}
```

## 参考リンク

- [@capacitor-community/background-geolocation ドキュメント](https://github.com/capacitor-community/background-geolocation)
- [Amazon Location Service ドキュメント](https://docs.aws.amazon.com/location/)
- [Capacitor公式ドキュメント](https://capacitorjs.com/docs)
