# 駅記録アプリ (Station Tracker)

JR山手線の駅訪問を自動記録するスマートフォンアプリ

## 機能概要

### 🚂 主要機能
- **自動駅訪問記録**: ジオフェンシング技術で駅への到着・出発を自動検出
- **リアルタイム追跡**: バックグラウンドでの位置情報追跡
- **訪問統計**: 訪問回数、訪問駅数、滞在時間などの詳細統計
- **履歴管理**: 過去の訪問記録の閲覧・検索・削除
- **プッシュ通知**: 駅到着・出発時の通知

### 📱 対応データ
- **JR山手線全29駅**: 東京、有楽町、新橋、浜松町、田町、品川、大崎、五反田、目黒、恵比寿、渋谷、原宿、代々木、新宿、新大久保、高田馬場、目白、池袋、大塚、巣鴨、駒込、田端、西日暮里、日暮里、鶯谷、上野、御徒町、秋葉原、神田
- **OSMポリゴンデータ**: OpenStreetMapから取得した駅建物の正確な範囲データ
- **位置情報**: 緯度・経度、到着・出発時刻、滞在時間
- **付加情報**: 天気、メモ、写真（拡張可能）

## 技術スタック

### バックエンド
- **Django 4.2.7**: Webフレームワーク
- **Django REST Framework**: API開発
- **SQLAlchemy**: ORM（将来的な拡張のため）
- **SQLite**: 開発用データベース（本番ではPostgreSQLを推奨）
- **django-cors-headers**: CORS対応

### フロントエンド  
- **Ionic 8**: ハイブリッドアプリフレームワーク
- **Angular 17**: UIフレームワーク
- **TypeScript**: 型安全なJavaScript
- **Capacitor**: ネイティブ機能アクセス

### ネイティブ機能
- **@capacitor/geolocation**: 位置情報取得
- **@capacitor/local-notifications**: ローカル通知
- **@capacitor/push-notifications**: プッシュ通知
- **背景位置追跡**: バックグラウンドでの継続的な位置監視

## プロジェクト構造

```
station-tracker/
├── backend/                    # Django REST API
│   ├── station_tracker/       # プロジェクト設定
│   ├── stations/              # 駅データ管理
│   ├── visits/                # 訪問記録管理
│   ├── accounts/              # ユーザー認証
│   ├── db.sqlite3            # データベース
│   ├── manage.py             # Django管理スクリプト
│   └── load_yamanote_data.py # 駅データ投入スクリプト
├── frontend/                  # Ionic Angular アプリ
│   ├── src/
│   │   ├── app/
│   │   │   ├── models/       # データモデル
│   │   │   ├── services/     # API・ジオフェンシングサービス
│   │   │   └── pages/        # 画面コンポーネント
│   │   └── assets/           # 静的ファイル
│   ├── capacitor.config.ts   # Capacitor設定
│   └── package.json          # 依存関係
└── README.md                 # このファイル
```

## セットアップ手順

### 前提条件
- Python 3.12+
- Node.js 18+
- npm または yarn
- Android Studio (Android開発時)
- Xcode (iOS開発時)

### バックエンドセットアップ

1. **Pythonの仮想環境作成と有効化**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
# または
venv\Scripts\activate     # Windows
```

2. **依存関係のインストール**
```bash
pip install django djangorestframework sqlalchemy psycopg2-binary django-cors-headers requests
```

3. **データベースマイグレーション**
```bash
python manage.py makemigrations
python manage.py migrate
```

4. **駅データの投入**
```bash
python load_yamanote_data.py
```

5. **管理者ユーザー作成**
```bash
python manage.py createsuperuser
```

6. **開発サーバー起動**
```bash
python manage.py runserver
```

### フロントエンドセットアップ

1. **依存関係のインストール**
```bash
cd frontend
npm install
```

2. **Capacitorの初期化**
```bash
npx cap init
```

3. **プラットフォーム追加**
```bash
npx cap add android
npx cap add ios
```

4. **開発サーバー起動**
```bash
ionic serve
```

## API エンドポイント

### 駅関連
- `GET /api/stations/` - 全駅取得
- `GET /api/stations/{id}/` - 特定駅取得
- `GET /api/stations/?lat={lat}&lng={lng}` - 近くの駅検索

### 訪問記録関連
- `GET /api/visits/` - ユーザーの訪問記録取得
- `POST /api/visits/` - 新しい訪問記録作成
- `PATCH /api/visits/{id}/` - 訪問記録更新
- `DELETE /api/visits/{id}/` - 訪問記録削除
- `GET /api/visits/stats/` - 訪問統計取得

### 認証関連
- `POST /api/accounts/register/` - ユーザー登録
- `POST /api/accounts/login/` - ログイン

## デプロイ

### バックエンド（クラウド例）
1. **環境変数設定**
```bash
export DEBUG=False
export SECRET_KEY="your-secret-key"
export DATABASE_URL="postgresql://..."
```

2. **本番用設定**
- SQLiteからPostgreSQLに変更
- ALLOWED_HOSTSを本番ドメインに設定
- 静的ファイル配信の設定

### フロントエンド（モバイルアプリ）
1. **ビルド**
```bash
ionic build
npx cap copy
npx cap sync
```

2. **Android**
```bash
npx cap open android
# Android Studioでビルド・署名・リリース
```

3. **iOS**
```bash
npx cap open ios  
# Xcodeでビルド・署名・App Store Connect
```

## 使用方法

1. **アプリ起動**: 初回起動時に位置情報権限を許可
2. **追跡開始**: ホーム画面で「追跡開始」ボタンをタップ
3. **自動記録**: 山手線駅に近づくと自動で到着を記録
4. **通知確認**: 駅到着・出発時に通知が表示される
5. **履歴確認**: 履歴ページで過去の訪問記録を閲覧

## 開発のポイント

### ジオフェンシング実装
- OSM Overpass APIから駅のポリゴンデータを取得
- Point-in-Polygon算法で駅範囲内判定
- フォールバック用の円形範囲（半径100m）

### バックグラウンド処理
- Capacitor Geolocationプラグインで継続的位置追跡
- フォアグラウンドサービスでバックグラウンド実行保証
- バッテリー最適化への対応が必要

### パフォーマンス最適化
- 位置更新頻度の調整
- APIコールの最小化
- ローカルストレージの活用

## トラブルシューティング

### よくある問題
1. **位置情報が取得できない**: 権限設定を確認
2. **背景追跡が停止する**: バッテリー最適化設定を無効化
3. **API接続エラー**: CORSとネットワーク設定を確認

### ログ確認
```bash
# Django
python manage.py runserver --verbosity=2

# Ionic
ionic serve --verbose

# Android
adb logcat
```

## 今後の拡張予定

- [ ] 他の鉄道路線対応
- [ ] 写真撮影機能
- [ ] 友達との記録共有
- [ ] 達成バッジシステム
- [ ] データエクスポート機能
- [ ] オフラインモード対応

## ライセンス

MIT License

## 作成者

駅記録アプリ開発チーム