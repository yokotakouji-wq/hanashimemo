# 話メモ (hanashimemo) — CLAUDE.md

## プロジェクト概要

介護施設ユニットリーダー（こうじさん）が職員との1on1や短い相談を、その場でスマホ録音→AI構造化メモに変換するiPhone向けWebアプリ。

**本番URL：** https://hanashimemo.vercel.app  
**GitHub：** yokotakouji-wq/hanashimemo  
**デプロイ：** Vercel（自動デプロイ、mainブランチ）

-----

## 技術スタック

- **フレームワーク：** Next.js 16.2.4（App Router）
- **言語：** TypeScript
- **スタイリング：** Tailwind CSS + インラインスタイル
- **AI（文字起こし）：** OpenAI Whisper API（whisper-1）※ 2026-04-20に切り替え
- **AI（構造化）：** Anthropic SDK（@anthropic-ai/sdk）
- **録音：** MediaRecorder API（audio/webm）
- **フォント：** Syne（Google Fonts）
- **デプロイ：** Vercel

-----

## ディレクトリ構成

```
hanashimemo/
├── app/
│   ├── api/
│   │   ├── transcribe/
│   │   │   └── route.ts        ← OpenAI Whisperで音声→テキスト変換
│   │   └── structure/
│   │       └── route.ts        ← Anthropic APIでテキスト→構造化JSON変換
│   ├── layout.tsx
│   ├── page.tsx                ← フロントエンド本体
│   └── globals.css
├── .env.local                  ← APIキー（gitignore済み）
├── .env.example                ← 環境変数のサンプル
├── next.config.ts
└── package.json
```

-----

## 環境変数

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

**設定場所：** Vercelダッシュボード → Settings → Environment Variables  
**注意：** `.env.local` はgitignore済み。チャットやコードにAPIキーを絶対に貼らない。

-----

## APIエンドポイント仕様

### POST /api/transcribe

**リクエスト：** FormData形式

```
audio: File（audio/webm）
```

**レスポンス：**

```json
{ "text": "文字起こしされたテキスト" }
```

### POST /api/structure

**リクエスト：**

```json
{ "text": "会話の文字起こしテキスト" }
```

**レスポンス：**

```json
{
  "title": "会話タイトル（10文字以内）",
  "summary": "要約（1〜2文）",
  "participants": ["相手の名前"],
  "topics": [{ "topic": "話題", "content": "詳細" }],
  "key_points": ["課題・懸念事項"],
  "decisions": ["決定事項"],
  "actions": ["アクションアイテム"],
  "next_steps": ["次のステップ"]
}
```

※ 感情メモ（emotional_notes）は2026-04-20に削除済み。

-----

## フロントエンドの状態遷移

```
idle → recording → processing → result
```

- **idle：** マイクアイコン＋タップして録音（青グロー）
- **recording：** タイマー表示＋STOPボタン（赤グロー）※リアルタイム文字起こしなし
- **processing：** スピナー＋"AIが解析中…"（Whisper文字起こし→Claude構造化の2ステップ）
- **result：** 構造化メモカード＋コピーボタン＋新しく録音ボタン

-----

## 録音フロー

```
録音開始（タップ）
→ MediaRecorderで音声録音（audio/webm）
→ 停止（タップ）
→ /api/transcribe にPOST → Whisperで日本語文字起こし
→ /api/structure にPOST → Claudeで構造化JSON生成
→ 結果表示
```

-----

## デザイン仕様

コーヒーアプリ（pour-over-engine）と同系統のデザイン。

|要素   |値                      |
|-----|-----------------------|
|背景   |`#070c1a`（ダークネイビー）     |
|アクセント|`#3b82f6`（青）           |
|グロー  |`rgba(59,130,246,0.35)`|
|録音中  |`#ef4444`（赤）           |
|フォント |Syne（Google Fonts）     |

-----

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# ビルド確認
npm run build

# 型チェック
npx tsc --noEmit
```

-----

## デプロイ手順

```bash
git add .
git commit -m "変更内容"
git push origin main
# → Vercelが自動でデプロイ
```

-----

## 既知の課題・今後の改善候補

- [ ] 複数人の会議に対応したフォーマットへの拡張
- [ ] 議事録アプリへの発展（委員会・ユニット会議向け）
- [ ] ロック画面ショートカット対応
- [ ] 長時間録音時の動作確認
- [ ] Whisper APIのコスト感の把握

-----

## 注意事項

- コード変更はClaudeCodeで行う（GitHub Web編集は文字化けするので使わない）
- APIキーはチャットやコードに絶対に直書きしない
- `.env.local` はgitignore済みなのでGitHubには上がらない
- GitHubにpushするとVercelが自動でデプロイする
