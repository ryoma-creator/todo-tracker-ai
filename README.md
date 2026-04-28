# Todo Tracker AI

タスクを記録・分析し、AIが達成傾向とボトルネックを診断するアプリ。

## 機能

- **今日のタスク** — タスク名・詳細・レバレッジ（やる価値）・優先度を記録
- **達成 / 未達成の記録** — 達成した理由・できなかった理由をその場で記録
- **履歴・統計** — 達成率・パターンを時系列で確認
- **AI診断** — 過去データから達成傾向・ボトルネックをパターン分析
- **AIチャット** — 「今週何を優先すべき？」など自由に相談

## Tech Stack

- **Expo** (React Native) — iOS / Android / Web 対応
- **Supabase** — 認証・データベース（RLS で完全個人分離）
- **OpenAI GPT-4o-mini** — AI診断・チャット

## セットアップ

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.local.example .env.local
# .env.local に Supabase・OpenAI のキーを設定

# Supabase にテーブルを作成
# supabase/schema.sql の内容を Supabase の SQL Editor で実行

# 起動
npm start          # Expo Go でスキャン
npm run ios        # iOS シミュレーター
npm run android    # Android エミュレーター
npm run web        # ブラウザ
```

## 環境変数

`.env.local` を作成して以下を設定：

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_OPENAI_API_KEY=your_openai_api_key
```

## ディレクトリ構成

```
app/
  (auth)/login.tsx       # ログイン画面
  (tabs)/
    index.tsx            # 今日のタスク
    history.tsx          # 履歴・達成率
    ai.tsx               # AI診断・チャット
components/
  TaskForm.tsx           # タスク入力フォーム
lib/
  supabase.ts            # Supabase クライアント
  types.ts               # 型定義
supabase/
  schema.sql             # DB テーブル定義
```

## Supabase テーブル設計

```
todo_tasks
  id             uuid (PK)
  user_id        uuid (FK → auth.users)
  date           date        ← 対象日
  title          text        ← タスク名
  description    text        ← 詳細
  leverage       text        ← やることで得られる価値・リターン
  priority       int 1-5     ← 優先度
  status         pending / done / failed
  achieve_reason text        ← 達成できた理由
  fail_reason    text        ← 達成できなかった理由
  due_date       date?       ← 期限日
```
