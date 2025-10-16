# Station Tracker - デプロイ手順 (Python CDK版)

## 概要

このドキュメントでは、Station TrackerアプリのAWSインフラをPython CDKでデプロイする手順を説明します。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Ionic + Capacitor + Background Geolocation)     │
│  - iOS/Android アプリ                                        │
│  - バックグラウンドで位置情報を定期送信                        │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTPS (API Key認証)
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  AWS API Gateway                                             │
│  - REST API                                                  │
│  - API Key認証                                               │
│  - レート制限: 100 req/sec                                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  AWS Lambda (Python 3.12)                                    │
│  - 位置情報を受信                                             │
│  - Amazon Location Service でジオフェンス評価                 │
│  - 最も近い駅を判定                                          │
│  - DynamoDBに訪問ログを保存                                   │
└─────────┬───────────────────┬───────────────────────────────┘
          │                   │
          ▼                   ▼
┌─────────────────┐  ┌──────────────────────────────────┐
│  DynamoDB       │  │  Amazon Location Service         │
│  - 訪問ログ保存  │  │  - Map (VectorEsriStreets)      │
│  - PK: user_id  │  │  - Place Index (Esri)           │
│  - SK: entered_at│  │  - Geofence Collection         │
└─────────────────┘  │    (駅ごとの円形ジオフェンス)      │
                     └──────────────────────────────────┘
```

## 前提条件

### 必須ツール
- **Python 3.12以上**
- **AWS CLI** 設定済み
- **Node.js 18以上** (CDK CLI用)
- **Git**

### AWS アカウント
- AWSアカウントとアクセスキー
- 適切なIAM権限（CloudFormation、Lambda、DynamoDB、API Gateway、Location Service）

## 手順

### 1. リポジトリの確認

```bash
cd /Users/daitado/station-tracker
```

### 2. CDK CLIのインストール

```bash
npm install -g aws-cdk
```

### 3. Python仮想環境の作成と依存関係のインストール

```bash
cd infrastructure
python3 -m venv .venv
source .venv/bin/activate  # Mac/Linux

# 依存関係をインストール
pip install -r requirements.txt
```

### 4. 設定ファイルの作成

```bash
cp config.example.json config.json
```

`config.json`を編集:

```json
{
  "aws": {
    "account": "123456789012",  // ← 自分のAWSアカウントID
    "region": "ap-northeast-1"
  },
  "stage": "dev",
  "locationService": {
    "mapName": "StationTrackerMap",
    "placeIndexName": "StationTrackerPlaceIndex",
    "geofenceCollectionName": "StationTrackerGeofences"
  },
  "api": {
    "throttle": {
      "rateLimit": 100,
      "burstLimit": 50
    }
  }
}
```

**AWSアカウントIDの確認方法**:
```bash
aws sts get-caller-identity --query Account --output text
```

### 5. CDK Bootstrap（初回のみ）

```bash
cdk bootstrap aws://123456789012/ap-northeast-1
```

※ `123456789012`を自分のAWSアカウントIDに置き換えてください。

### 6. デプロイ前の確認

```bash
# CloudFormationテンプレートを確認
cdk synth

# 何がデプロイされるか確認
cdk diff
```

### 7. デプロイ

```bash
cdk deploy
```

デプロイには5-10分かかります。

### 8. 出力情報の保存

デプロイ完了後、以下の情報が表示されます:

```
Outputs:
StationTrackerStack-dev.ApiUrl = https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev/
StationTrackerStack-dev.ApiKeyId = xxxxxxxxxx
StationTrackerStack-dev.ApiKeyCommand = aws apigateway get-api-key --api-key xxxxxxxxxx --include-value --query 'value' --output text
StationTrackerStack-dev.GeofenceCollectionName = StationTrackerGeofences
StationTrackerStack-dev.DynamoDBTableName = station-tracker-visits-dev
```

これらの情報をメモしておいてください。

### 9. API Keyの取得

出力された`ApiKeyCommand`をコピーして実行:

```bash
aws apigateway get-api-key --api-key xxxxxxxxxx --include-value --query 'value' --output text
```

出力されたAPI Keyをメモ。

### 10. 駅データをAmazon Location Serviceに登録

Djangoデータベースから駅データを読み込んでジオフェンスを作成:

```bash
# 仮想環境が有効な状態で実行
python3 scripts/export_stations_to_als.py \
  --collection StationTrackerGeofences \
  --region ap-northeast-1 \
  --radius 100
```

**出力例**:
```
Loading stations from /Users/daitado/station-tracker/backend/db.sqlite3...
Loaded 30 stations from database
Creating geofences in collection 'StationTrackerGeofences'...
Batch 1: Created 10 geofences
Batch 2: Created 10 geofences
Batch 3: Created 10 geofences

Summary:
  Total created: 30
  Total failed: 0

✅ Successfully created 30 geofences!
```

### 11. フロントエンドの設定

#### 11.1. 環境変数ファイルの編集

`frontend/src/environments/environment.ts`を編集:

```typescript
export const environment = {
  production: false,
  api: {
    baseUrl: 'https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com',  // ← ApiUrl
    apiKey: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',  // ← 手順9で取得したAPI Key
    endpoints: {
      location: '/dev/location'
    }
  }
};
```

本番環境用に`environment.prod.ts`も同様に編集。

#### 11.2. フロントエンドのビルドと同期

```bash
cd ../frontend
npm run build
npx cap sync
```

### 12. 動作確認

#### 12.1. APIのテスト

```bash
curl -X POST https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/dev/location \
  -H "Content-Type: application/json" \
  -H "x-api-key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "user_id": "test_user_001",
    "lat": 35.6812,
    "lng": 139.7671,
    "timestamp": "2025-10-15T10:00:00Z"
  }'
```

**期待される応答**:
```json
{
  "message": "Location processed successfully",
  "geofence": "station_1"
}
```

#### 12.2. DynamoDBの確認

```bash
aws dynamodb scan \
  --table-name station-tracker-visits-dev \
  --limit 10
```

#### 12.3. CloudWatch Logsの確認

```bash
aws logs tail /aws/lambda/station-tracker-location-processor-dev --follow
```

### 13. アプリの実行

#### iOS
```bash
cd frontend
npx cap open ios
```

Xcodeでビルドして実機で実行。

#### Android
```bash
cd frontend
npx cap open android
```

Android Studioでビルドして実機で実行。

## トラブルシューティング

### デプロイエラー

**エラー**: `Error: Need to perform AWS calls for account XXX, but no credentials configured`

**解決策**:
```bash
aws configure
```

---

**エラー**: `Error: This stack uses assets, so the toolkit stack must be deployed`

**解決策**:
```bash
cdk bootstrap
```

---

**エラー**: `ModuleNotFoundError: No module named 'aws_cdk'`

**解決策**:
```bash
# 仮想環境をactivateして再度インストール
source .venv/bin/activate
pip install -r requirements.txt
```

---

### Lambda関数のエラー

**症状**: API呼び出しが500エラーを返す

**確認方法**:
```bash
aws logs tail /aws/lambda/station-tracker-location-processor-dev --follow
```

**よくある原因**:
1. ジオフェンスが登録されていない → 手順10を実行
2. IAM権限不足 → CDKスタックを再デプロイ
3. DynamoDB書き込みエラー → CloudWatch Logsを確認

---

### ジオフェンスが動作しない

**確認方法**:
```bash
python3 scripts/export_stations_to_als.py \
  --collection StationTrackerGeofences \
  --list-only
```

**対処**:
ジオフェンスが0件の場合、手順10を実行。

---

### フロントエンドから接続できない

**確認項目**:
1. `environment.ts`のAPIURLとAPI Keyが正しいか
2. API GatewayのCORSが有効か（CDKで自動設定済み）
3. ネットワーク接続があるか

**デバッグ**:
ブラウザの開発者ツールでネットワークタブを確認。

---

## コスト見積もり

### 無料枠内（想定）
- **Lambda**: 月100万リクエストまで無料
- **API Gateway**: 月100万リクエストまで無料
- **DynamoDB**: 25GBストレージ、25万書き込み/秒まで無料

### 有料部分
- **Amazon Location Service**:
  - Geofence評価: $0.00005/リクエスト
  - ジオフェンスストレージ: $0.01/月（最初の1000個）

**月間コスト試算**（1ユーザー、1日100リクエスト）:
- Location Service: 3,000リクエスト × $0.00005 = $0.15
- **合計**: 約 $0.15/月

## クリーンアップ

### スタックの削除

```bash
cd infrastructure
source .venv/bin/activate
cdk destroy
```

⚠️ **注意**: 本番環境のDynamoDBテーブルは保護されています（`RemovalPolicy.RETAIN`）。
手動で削除する必要があります:

```bash
aws dynamodb delete-table --table-name station-tracker-visits-prod
```

## Python CDKのメリット

### 1. **統一性**
- Lambda関数: Python 3.12
- 駅データエクスポート: Python
- バックエンド: Python (Django)
- **インフラ定義: Python** ← NEW!

→ **プロジェクト全体がPythonで統一**

### 2. **シンプル**
- `requirements.txt`だけで依存管理
- `package.json`, `tsconfig.json`不要（CDK CLI以外）

### 3. **学習コスト削減**
- TypeScript/Node.jsの知識が不要
- Pythonの知識だけで完結

## 次のステップ

1. **ユーザー認証の追加**: Cognitoを統合
2. **通知機能**: SNS + Push Notificationsで駅到着通知
3. **分析ダッシュボード**: QuickSightで訪問統計を可視化
4. **本番環境デプロイ**: `config.json`で`stage: "prod"`に変更してデプロイ

## サポート

問題が解決しない場合:
1. CloudWatch Logsを確認
2. `cdk synth`でテンプレートを確認
3. 実行したコマンドと出力を記録
