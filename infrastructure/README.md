# Station Tracker Infrastructure (Python CDK)

AWS CDK (Python)を使用した駅トラッカーアプリのインフラストラクチャ。

## アーキテクチャ

```
Frontend (Ionic + Capacitor)
    ↓ HTTPS (API Key認証)
API Gateway
    ↓
Lambda (Python 3.12)
    ↓
    ├→ Amazon Location Service (ジオフェンス評価)
    └→ DynamoDB (訪問ログ保存)
```

## 構成要素

### 1. DynamoDB
- **テーブル名**: `station-tracker-visits-{stage}`
- **キー構造**:
  - PK: `user_id` (STRING)
  - SK: `entered_at` (STRING - ISO 8601 timestamp)
- **属性**:
  - `station_id`: 駅ID
  - `exited_at`: 退出時刻 (NULL可)
  - `latitude`, `longitude`: 実際の位置
  - `distance_meters`: 駅中心からの距離

### 2. Amazon Location Service
- **Map**: VectorEsriStreets
- **Place Index**: Esri
- **Geofence Collection**: 駅ごとの円形ジオフェンス (半径100m)

### 3. API Gateway
- **認証**: API Key
- **エンドポイント**: `POST /location`
- **リクエスト形式**:
  ```json
  {
    "user_id": "user123",
    "lat": 35.6812,
    "lng": 139.7671,
    "timestamp": "2025-10-15T10:00:00Z"
  }
  ```

### 4. Lambda関数
- **Runtime**: Python 3.12
- **処理内容**:
  1. 位置情報を受信
  2. Amazon Location Serviceでジオフェンス評価
  3. 最も近い駅を判定
  4. 入退室イベントをDynamoDBに保存

## セットアップ

### 1. 前提条件
- **Python 3.12以上**
- **AWS CLI設定済み**
- **Node.js 18以上** (CDK CLI用)

### 2. CDK CLIのインストール (グローバル)
```bash
npm install -g aws-cdk
```

### 3. Python仮想環境の作成
```bash
cd infrastructure
python3 -m venv .venv
source .venv/bin/activate  # Linux/Mac
# または
.venv\Scripts\activate.bat  # Windows
```

### 4. 依存関係のインストール
```bash
pip install -r requirements.txt
```

### 5. 設定ファイル作成
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

**AWSアカウントIDの確認**:
```bash
aws sts get-caller-identity --query Account --output text
```

### 6. CDK Bootstrap (初回のみ)
```bash
cdk bootstrap aws://123456789012/ap-northeast-1
```

### 7. デプロイ
```bash
cdk deploy
```

デプロイ完了後、以下の情報が出力されます:
- **ApiUrl**: APIのエンドポイントURL
- **ApiKeyId**: API KeyのID
- **GeofenceCollectionName**: ジオフェンスコレクション名
- **DynamoDBTableName**: DynamoDBテーブル名
- **ApiKeyCommand**: API Key取得コマンド

### 8. API Keyの取得
```bash
# 出力されたコマンドを実行
aws apigateway get-api-key --api-key <ApiKeyId> --include-value --query 'value' --output text
```

### 9. 駅データをAmazon Location Serviceに登録

```bash
python3 scripts/export_stations_to_als.py \
  --collection StationTrackerGeofences \
  --region ap-northeast-1 \
  --radius 100
```

**オプション**:
- `--db-path`: Django SQLiteデータベースのパス（自動検出されない場合）
- `--radius`: ジオフェンス半径（デフォルト: 100m）
- `--list-only`: 既存のジオフェンスを一覧表示のみ

## 動作確認

### 1. APIのテスト
```bash
curl -X POST https://YOUR_API_URL/dev/location \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "user_id": "test_user_001",
    "lat": 35.6812,
    "lng": 139.7671,
    "timestamp": "2025-10-15T10:00:00Z"
  }'
```

### 2. DynamoDBの確認
```bash
aws dynamodb scan \
  --table-name station-tracker-visits-dev \
  --limit 10
```

### 3. ジオフェンスの確認
```bash
python3 scripts/export_stations_to_als.py \
  --collection StationTrackerGeofences \
  --list-only
```

## メンテナンス

### CDKコマンド
```bash
# CloudFormationテンプレートの確認
cdk synth

# 差分確認
cdk diff

# デプロイ
cdk deploy

# スタック削除
cdk destroy
```

### ログの確認
```bash
aws logs tail /aws/lambda/station-tracker-location-processor-dev --follow
```

## プロジェクト構造

```
infrastructure/
├── app.py                       # CDKアプリのエントリーポイント
├── station_tracker_stack.py    # メインスタック定義
├── requirements.txt             # Python依存関係
├── cdk.json                     # CDK設定
├── config.example.json          # 設定ファイルのサンプル
├── config.json                  # 実際の設定（gitignore済み）
├── lambda/
│   └── location-processor/
│       ├── lambda_function.py   # Lambda関数
│       └── requirements.txt     # Lambda依存関係
└── scripts/
    └── export_stations_to_als.py # 駅データエクスポート
```

## トラブルシューティング

### デプロイエラー: 認証情報が見つからない
```bash
aws configure
```

### デプロイエラー: Bootstrap未実行
```bash
cdk bootstrap
```

### Lambda関数のエラー
```bash
# ログを確認
aws logs tail /aws/lambda/station-tracker-location-processor-dev --follow
```

### ジオフェンスが動作しない
```bash
# ジオフェンスの確認
python3 scripts/export_stations_to_als.py --collection StationTrackerGeofences --list-only

# 再登録
python3 scripts/export_stations_to_als.py --collection StationTrackerGeofences
```

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
- 合計: 約 $0.15/月

## クリーンアップ

```bash
cdk destroy
```

⚠️ 本番環境のDynamoDBテーブルは保護されています（`RemovalPolicy.RETAIN`）。
