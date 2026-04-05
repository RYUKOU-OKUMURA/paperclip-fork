# Codexエージェント運用手順

作成日: 2026-04-05

## 1. 目的

この手順は、Paperclip 上で `codex_local` エージェントを新規設定または既存エージェントから切り替える際に、再現性高く動作させるための標準運用手順です。

対象:

- 新しく Codex エージェントを作る場合
- `claude_local` など既存 adapter から `codex_local` へ切り替える場合
- ローカル開発環境で Codex agent の動作確認をする場合

## 2. 事前条件

以下が満たされていること。

### 2.1 Codex CLI

```sh
command -v codex
codex --version
```

### 2.2 Codex 認証

```sh
ls ~/.codex/auth.json
```

`auth.json` が無い場合は、Codex 側のログインを先に済ませること。

### 2.3 Paperclip instance 初期化

以下が存在することを確認する。

```sh
ls ~/.paperclip/instances/default/config.json
ls ~/.paperclip/instances/default/.env
ls ~/.paperclip/instances/default/secrets/master.key
```

不足している場合は初期化を行う。

```sh
pnpm paperclipai onboard --yes
```

## 3. 開発サーバー起動

リポジトリルートで実行する。

```sh
pnpm dev
```

この fork では `3100` が使用中の場合、自動で `3101+` にずれる。実際にどのポートで起動しているかを確認する。

```sh
curl http://127.0.0.1:3100/api/health
curl http://127.0.0.1:3101/api/health
```

止める場合:

```sh
pnpm dev:stop
```

## 4. UI での Codex 設定

対象 agent の adapter を以下で設定する。

- Adapter: `codex_local`
- Model: `gpt-5.3-codex`
- `cwd`: 対象プロジェクトのルート
- `instructionsFilePath`: managed instructions の `AGENTS.md`
- `search`: `false`
- `dangerouslyBypassApprovalsAndSandbox`: `true`
- `timeoutSec`: `180`
- `graceSec`: `15`

初回はまず上記の保守的な固定値で合わせること。model だけ必要に応じて変える。

## 5. adapter 切り替え時の必須手順

既存 agent を `claude_local` などから `codex_local` に切り替える場合、adapter の更新だけで終わらせてはいけない。

必ず runtime session をリセットすること。

```http
POST /api/agents/:id/runtime-state/reset-session
```

理由:

- adapter ごとに session の持ち方が異なる
- 古い session ID を新 adapter が resume できないことがある
- 今回もこの stale session が Codex 起動失敗の直接原因になった

## 6. 設定後の標準確認手順

### 6.1 adapter 環境テスト

まず test-environment を通す。

確認項目:

- `codex` command が見えている
- native auth が有効
- login 状態がある
- `hello` probe が通る

### 6.2 実タスクを 1 件割り当てる

設定確認に空 inbox は使わない。必ず対象 agent に 1 件 issue を割り当てる。

理由:

- 空 inbox だと「実行はできているがやることがない」状態と「設定不良」が見分けにくい
- issue checkout、comment、status update まで確認して初めて設定完了と判断できる

### 6.3 heartbeat 実行

UI か API で heartbeat を実行する。

### 6.4 run log で確認すること

以下が揃っていれば正常。

- Codex process が起動している
- `PAPERCLIP_API_KEY` が注入されている
- `GET /api/agents/me` が成功している
- `GET /api/agents/me/inbox-lite` が成功している
- issue checkout が成功している
- issue への comment または status 更新が実行されている

## 7. トラブル時の切り分け

### 7.1 `Agent authentication required`

原因候補:

- instance 初期化不足
- local agent JWT secret 未設定
- `PAPERCLIP_API_KEY` 未注入

対応:

1. `pnpm paperclipai onboard --yes`
2. dev server 再起動
3. run log で `PAPERCLIP_API_KEY` 注入有無を確認

### 7.2 `thread/resume failed` などの session 再開失敗

原因候補:

- 以前の adapter の session が残っている

対応:

1. agent の runtime session を reset
2. heartbeat を新規 session で再実行

### 7.3 heartbeat が長く終わらない

原因候補:

- 空 inbox のまま Codex が長考している
- `timeoutSec` が未設定

対応:

1. `timeoutSec` を設定する
2. 空 inbox での確認をやめ、assigned issue で確認する
3. 必要なら control plane から run を cancel する

## 8. 推奨運用ルール

Codex agent の運用は以下を標準にする。

1. 新規作成前に `codex` CLI、認証、instance 初期化を確認する
2. adapter 切り替え時は必ず session reset を行う
3. 設定確認は空 inbox ではなく assigned issue で行う
4. `timeoutSec` を必ず入れる
5. まずは `search: false` で始める
6. まずは `gpt-5.3-codex` を標準モデルにする

## 9. 実務用チェックリスト

設定前:

- `codex --version` を確認した
- `~/.codex/auth.json` を確認した
- `~/.paperclip/instances/default/` の初期ファイルを確認した
- 必要なら `pnpm paperclipai onboard --yes` を実行した

設定時:

- `codex_local` を選択した
- `cwd` をプロジェクトルートに設定した
- `instructionsFilePath` を設定した
- `timeoutSec: 180` を設定した
- `graceSec: 15` を設定した

切り替え時:

- adapter 変更後に session reset を実行した

確認時:

- `test-environment` が通った
- assigned issue を 1 件用意した
- heartbeat を実行した
- checkout と comment/status update を確認した

## 10. 完了条件

Codex agent の設定完了は、次を満たした時点とする。

1. `test-environment` が成功している
2. `PAPERCLIP_API_KEY` 注入が確認できている
3. `agents/me` と `inbox-lite` への API 呼び出しが成功している
4. assigned issue に対して checkout と task update が完了している

この 4 条件を満たして初めて「設定完了」と扱うこと。
