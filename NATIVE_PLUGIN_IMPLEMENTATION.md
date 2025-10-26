# Station Tracker Native Geolocation Plugin - 実装完了レポート

## 概要

`@capacitor-community/background-geolocation`を削除し、完全にネイティブコード（Swift + Kotlin）で実装した新しいプラグイン `StationTrackerGeolocation` を作成しました。

## なぜネイティブ実装に移行したのか

### @capacitor-community/background-geolocationの問題点

1. **信頼性の欠如**: メンテナンス状況が不明確で、本番環境での責任を負える人がいない
2. **運用上の不完全性**: 以下の機能が欠けている
   - 確実な再起動後の自動復帰
   - オフライン時の永続キューと再送機能
   - メーカー固有の省エネ機能への対応
   - ネイティブレベルの静止判定

### ネイティブ実装のメリット

1. **完全なコントロール**: すべてのロジックをネイティブコードで管理
2. **運用上の信頼性**:
   - SQLite/CoreDataによる永続ストレージ
   - 指数バックオフ付き再送機能
   - OS再起動後の自動復帰
3. **電池効率**: OSネイティブの省エネ機能を最大限活用
4. **保守性**: 問題が発生したら自分で修正可能

---

## 実装内容

### プラグイン構成

```
station-tracker-geolocation/
├── src/
│   ├── definitions.ts      # TypeScript型定義
│   ├── index.ts             # プラグインエントリーポイント
│   └── web.ts               # Web実装（スタブ）
├── android/
│   └── src/main/java/com/stationtracker/geolocation/
│       ├── StationTrackerGeolocationPlugin.kt    # Capacitorプラグイン
│       ├── LocationTrackingService.kt            # Foreground Service
│       ├── LocationDatabase.kt                   # SQLiteデータベース
│       ├── BootReceiver.kt                       # 再起動時の自動復帰
│       ├── DailyMaintenanceWorker.kt             # WorkManager定期タスク
│       └── WorkManagerHelper.kt                  # WorkManager管理
└── ios/
    └── Plugin/
        ├── StationTrackerGeolocationPlugin.swift # Capacitorプラグイン
        ├── LocationManager.swift                 # CLLocationManager管理
        ├── LocationDatabase.swift                # CoreDataストレージ
        └── StationTrackerGeolocationPlugin.m     # Objective-Cブリッジ
```

---

## Android実装の詳細

### 1. Foreground Service（LocationTrackingService.kt）

**目的**: OSに殺されないように常時通知を表示

```kotlin
class LocationTrackingService : Service() {
    // 通知を表示してフォアグラウンドサービスとして実行
    startForeground(NOTIFICATION_ID, notification)

    // FusedLocationProviderClientで位置取得（distanceFilter: 10m）
    fusedLocationClient.requestLocationUpdates(locationRequest, ...)
}
```

**機能**:
- 10m移動ごとに位置更新
- SQLiteに即座に保存
- 1分ごとに未送信データをAWS APIへ送信
- 静止判定ロジック（50m以内に5分間）

### 2. SQLiteデータベース（LocationDatabase.kt）

**スキーマ**:
```sql
CREATE TABLE locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL NOT NULL,
    timestamp INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0
)
```

**機能**:
- オフライン時も確実に保存
- 送信失敗時はretry_countをインクリメント
- 指数バックオフ：3回失敗したら一時停止
- 送信成功後は1週間後に自動削除

### 3. Boot Receiver（BootReceiver.kt）

```kotlin
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // SharedPreferencesから前回の状態を確認
            if (wasTracking) {
                // サービスを自動再起動
                startForegroundService(...)
            }
        }
    }
}
```

### 4. WorkManager定期タスク（DailyMaintenanceWorker.kt）

**スケジュール**: 毎朝6時

**処理内容**:
1. トラッキングサービスが起動しているか確認→必要なら再起動
2. 未送信データの強制送信
3. 7日以上前の古いレコードを削除

---

## iOS実装の詳細

### 1. CLLocationManager（LocationManager.swift）

```swift
class LocationManager: NSObject, CLLocationManagerDelegate {
    func startTracking() {
        clLocationManager.desiredAccuracy = kCLLocationAccuracyBest
        clLocationManager.allowsBackgroundLocationUpdates = true
        clLocationManager.pausesLocationUpdatesAutomatically = false
        clLocationManager.distanceFilter = Double(distanceFilter)

        clLocationManager.startUpdatingLocation()
    }
}
```

**機能**:
- バックグラウンドでの位置更新を有効化
- 自動一時停止を無効化（常時追跡）
- 静止判定ロジック（50m以内に5分間）

### 2. CoreDataストレージ（LocationDatabase.swift）

**エンティティ: LocationEntity**
```swift
@NSManaged var id: UUID?
@NSManaged var latitude: Double
@NSManaged var longitude: Double
@NSManaged var accuracy: Double
@NSManaged var timestamp: Date?
@NSManaged var userId: String?
@NSManaged var retryCount: Int32
@NSManaged var sent: Bool
```

**機能**:
- Androidと同じくオフライン対応
- 指数バックオフ付き再送
- 送信成功後は1週間後に削除

### 3. タイマーによる定期送信

```swift
private func scheduleSendTimer() {
    sendTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in
        Task {
            await self.sendPendingLocations()
        }
    }
}
```

**Note**: iOSではWorkManagerの代わりにTimerを使用（バックグラウンドでは制限あり）

---

## AWS API統合

### 送信フォーマット

```json
POST /dev/location
Headers:
  Content-Type: application/json
  x-api-key: <API_KEY>

Body:
{
  "user_id": "default_user",
  "lat": 35.6812,
  "lng": 139.7671,
  "timestamp": "2025-10-26T17:00:00Z"
}
```

### 再送ロジック

1. **即座に送信試行**: 位置取得後すぐにAPI送信
2. **失敗時**: SQLite/CoreDataに保存
3. **1分後に再送**: タイマーで定期的に未送信データをチェック
4. **指数バックオフ**:
   - 1回目失敗: 即座に再試行
   - 2回目失敗: 次回の定期送信時
   - 3回目失敗: 一時停止（ログに記録）

---

## フロントエンド統合

### geolocation.service.ts の変更

**Before（@capacitor-community/background-geolocation）**:
```typescript
import { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

await BackgroundGeolocation.addWatcher({...}, callback);
```

**After（ネイティブプラグイン）**:
```typescript
import { StationTrackerGeolocation } from '../../../station-tracker-geolocation/src';

// 設定
await StationTrackerGeolocation.configure({
  apiUrl: environment.api.baseUrl,
  apiKey: environment.api.apiKey,
  userId: this.userId,
  endpoint: '/dev/location'
});

// 開始
await StationTrackerGeolocation.startTracking({
  distanceFilter: 10,
  stationaryRadius: 50,
  stationaryTime: 300
});

// イベントリスナー
StationTrackerGeolocation.addListener('locationUpdate', (location) => {
  console.log(location);
});
```

---

## 実装済み機能リスト

### ✅ Android
1. Foreground Service（常駐通知）
2. FusedLocationProviderClientによる位置追跡（10m間隔）
3. SQLiteによるローカルキュー
4. 指数バックオフ付き再送機能
5. Boot Receiver（再起動後自動復帰）
6. WorkManager（毎朝6時の定期タスク）
7. 静止判定（50m以内に5分間）
8. AWS API送信（x-api-key認証）

### ✅ iOS
1. CLLocationManagerによる位置追跡（10m間隔）
2. バックグラウンド位置更新の許可
3. CoreDataによるローカルキュー
4. 指数バックオフ付き再送機能
5. 静止判定（50m以内に5分間）
6. Timerによる定期送信（1分間隔）
7. AWS API送信（x-api-key認証）

---

## 権限設定

### Android（AndroidManifest.xml）

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

### iOS（Info.plist）

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

---

## ビルドと同期

### 実行済みコマンド

```bash
# プラグインのビルド
cd frontend/station-tracker-geolocation
npm install
npm run build

# フロントエンドへのインストール
cd ..
npm install ./station-tracker-geolocation

# Capacitor同期
npm run build
npx cap sync
```

### 同期結果

```
✔ Found 3 Capacitor plugins for android:
  @capacitor/local-notifications@7.0.2
  @capacitor/push-notifications@7.0.2
  station-tracker-geolocation@1.0.0

✔ Found 3 Capacitor plugins for ios:
  @capacitor/local-notifications@7.0.2
  @capacitor/push-notifications@7.0.2
  station-tracker-geolocation@1.0.0
```

**✅ 新しいプラグインが正常に認識されました**

---

## テスト方法

### Android

1. **Android Studioで開く**:
   ```bash
   npx cap open android
   ```

2. **実機で実行**:
   - ビルド → 実機にインストール
   - アプリ起動 → 位置情報権限を「常に許可」に設定
   - トラッキング開始
   - 通知バーに「バックグラウンドで位置を追跡中」が表示されることを確認

3. **バックグラウンドテスト**:
   - アプリをバックグラウンドに移動
   - 10m以上移動
   - Logcatで`LocationTrackingService`のログを確認

4. **再起動テスト**:
   - 端末を再起動
   - 自動的にトラッキングが再開されることを確認

5. **オフラインテスト**:
   - 機内モードにする
   - 移動
   - WiFi復帰後、自動的に送信されることを確認

### iOS

1. **Xcodeで開く**:
   ```bash
   npx cap open ios
   ```

2. **実機で実行**:
   - ビルド → 実機にインストール
   - アプリ起動 → 位置情報権限を「常に」に設定
   - トラッキング開始

3. **バックグラウンドテスト**:
   - アプリをバックグラウンドに移動
   - 10m以上移動
   - Xcodeのコンソールで`LocationManager`のログを確認

4. **オフラインテスト**:
   - 機内モードにする
   - 移動
   - WiFi復帰後、自動的に送信されることを確認

---

## トラブルシューティング

### Android: 位置情報が取得できない

**確認事項**:
1. 位置情報権限が「常に許可」になっているか
2. 端末の位置情報サービスが有効か
3. バッテリー最適化から除外されているか

**解決策**:
```bash
# Logcatでエラーを確認
adb logcat | grep LocationTrackingService
```

### iOS: バックグラウンドで停止する

**確認事項**:
1. Info.plistに`UIBackgroundModes`が設定されているか
2. `allowsBackgroundLocationUpdates = true`になっているか
3. バックグラウンド更新が有効か（設定アプリで確認）

**解決策**:
Xcodeのコンソールでログを確認:
```
LocationManager: Started tracking with distance filter: 10.0m
```

### API送信エラー

**確認事項**:
1. `environment.ts`のAPI URLとAPI Keyが正しいか
2. ネットワーク接続があるか
3. AWS API Gatewayが正常に動作しているか

**デバッグ**:
```bash
# 未送信データの数を確認
await geolocationService.getQueueSize();

# 強制送信
await geolocationService.forceSendQueue();
```

---

## まとめ

### 達成したこと

1. ✅ `@capacitor-community/background-geolocation`を完全に削除
2. ✅ Android（Kotlin）とiOS（Swift）でネイティブ実装
3. ✅ Foreground Service + 永続キュー + 再送機能
4. ✅ Boot Receiver + WorkManager（Android）
5. ✅ 静止判定ロジック（50m/5分）
6. ✅ AWS API統合（既存エンドポイント）
7. ✅ Capacitor同期完了

### 次のステップ

1. **実機テスト**: Android/iOSで動作確認
2. **AWS インフラデプロイ**: `infrastructure/`のCDKスタックをデプロイ
3. **エンドツーエンドテスト**: 位置送信 → Lambda → DynamoDB
4. **長期運用テスト**: 24時間以上の連続動作確認

---

## ファイル一覧

### 新規作成

```
frontend/station-tracker-geolocation/
├── package.json
├── tsconfig.json
├── rollup.config.js
├── StationTrackerGeolocation.podspec
├── src/
│   ├── definitions.ts
│   ├── index.ts
│   └── web.ts
├── android/
│   ├── build.gradle
│   ├── src/main/AndroidManifest.xml
│   └── src/main/java/com/stationtracker/geolocation/
│       ├── StationTrackerGeolocationPlugin.kt
│       ├── LocationTrackingService.kt
│       ├── LocationDatabase.kt
│       ├── BootReceiver.kt
│       ├── DailyMaintenanceWorker.kt
│       └── WorkManagerHelper.kt
└── ios/
    └── Plugin/
        ├── StationTrackerGeolocationPlugin.swift
        ├── StationTrackerGeolocationPlugin.m
        ├── LocationManager.swift
        └── LocationDatabase.swift
```

### 変更したファイル

- `frontend/src/app/services/geolocation.service.ts`
- `frontend/capacitor.config.ts`
- `frontend/package.json`

---

## 参考資料

- [Android FusedLocationProviderClient](https://developers.google.com/location-context/fused-location-provider)
- [Android WorkManager](https://developer.android.com/topic/libraries/architecture/workmanager)
- [iOS CLLocationManager](https://developer.apple.com/documentation/corelocation/cllocationmanager)
- [Capacitor Plugin Development](https://capacitorjs.com/docs/plugins/creating-plugins)
