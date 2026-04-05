# Codexエージェント設定トラブル調査レポート

作成日: 2026-04-05

## 1. 要約

今回、Paperclip 上でエージェントを動かせなかった原因は、単一の不具合ではなく次の3段階でした。

1. Local adapter 用の認証シークレット未初期化により、`PAPERCLIP_API_KEY` が実行時に注入されていなかった
2. `claude_local` から `codex_local` へ切り替えた際に、古い Claude セッション ID を Codex が再開しようとして失敗した
3. Codex 自体は正常起動した後、担当タスク 0 件の heartbeat で長く待機し続けやすい運用状態になっていた

このうち、本質的に「設定できなかった」主原因は 1 と 2 です。3 は設定完了後の運用面の詰まりです。

## 2. 発生していた症状

### 2.1 初期症状

- UI は開ける
- ボード操作もできる
- しかしエージェント実行時に内部で仕事が進まない

### 2.2 実際に確認されたエラー

ローカル adapter 実行時、サーバーログに以下の状態が出ていました。

- `local agent jwt secret missing or invalid; running without injected PAPERCLIP_API_KEY`

その結果、エージェント側の API 呼び出しで認証エラーが発生していました。

- `{"error":"Agent authentication required"}`

その後 `codex_local` に切り替えた直後は、以下のセッション再開エラーが発生しました。

- `thread/resume failed: no rollout found for thread id ffec6441-96b0-4bfd-b98f-8177e7c9a333`

## 3. 原因の詳細

### 3.1 原因1: default instance の初期化不足

Paperclip の local adapter は、エージェント実行時に短命 JWT を発行し、それを `PAPERCLIP_API_KEY` として agent process に注入します。この JWT 発行には instance 側のシークレットが必要です。

今回の環境では、default instance に必要な初期ファイルが存在していませんでした。

- `~/.paperclip/instances/default/config.json`
- `~/.paperclip/instances/default/.env`
- `~/.paperclip/instances/default/secrets/master.key`

この状態では local adapter が agent 用 JWT を安全に生成できず、結果として agent process から Paperclip API に認証付きアクセスができません。

### 3.2 原因2: adapter 切り替え時の stale session

認証問題を解消した後、CTO agent を `claude_local` から `codex_local` に切り替えました。この時、agent runtime state に保存されていた前回の session 情報が残っていました。

Paperclip は heartbeat 実行時に前回 session の再開を試みますが、Claude の session ID は Codex では再利用できません。結果として Codex は存在しない rollout を resume しようとして失敗しました。

つまり、adapter を跨いだ session 互換性は前提にできないため、切り替え時には runtime session の明示的リセットが必要です。

### 3.3 原因3: タスク未割当時の Codex heartbeat 待機

Codex 側の起動と API 認証は正常化した後も、CTO に割り当てられた issue が 0 件のまま heartbeat を実行すると、Codex run がしばらく継続して待機し続けるケースを確認しました。

実際には以下までは正常でした。

- `GET /api/agents/me` 成功
- `GET /api/agents/me/inbox-lite` 成功
- `GET /api/companies/{companyId}/issues?...` 成功
- いずれも空配列または正常レスポンス

つまりこの段階では「設定失敗」ではなく、「空 inbox の heartbeat が長くぶら下がる」運用上の問題でした。

## 4. 実施した修正

### 4.1 instance 初期化

以下を実行して default instance を正しく生成しました。

```sh
pnpm paperclipai onboard --yes
```

これにより、instance 設定と secrets が生成され、起動時に `Agent JWT set` を確認できる状態になりました。

### 4.2 開発サーバー再起動

stale な dev runner を停止し、Paperclip fork の dev server を再起動しました。

今回の fork は `3100` が使用中の場合に `3101+` へ退避するため、最終的な動作ポートは以下になりました。

- `http://127.0.0.1:3101`

ヘルスチェック:

```sh
curl http://127.0.0.1:3101/api/health
```

### 4.3 Codex 実行環境テスト

`codex_local` adapter の実行前検証を行い、次を確認しました。

- `codex` CLI がインストール済み
- `~/.codex/auth.json` が存在
- Codex のログイン状態あり
- `hello` probe 成功

### 4.4 CTO agent を Codex に切り替え

CTO agent の adapter を `codex_local` に更新しました。実運用で使う設定は次です。

- `adapterType`: `codex_local`
- `cwd`: `/Users/ryukouokumura/Desktop/paperclip-fork`
- `model`: `gpt-5.3-codex`
- `instructionsFilePath`: managed instructions の `AGENTS.md`
- `search`: `false`
- `dangerouslyBypassApprovalsAndSandbox`: `true`

### 4.5 stale session のリセット

adapter 切り替え後、以下の API で runtime session を明示的に初期化しました。

```http
POST /api/agents/:id/runtime-state/reset-session
```

これにより `sessionId: null` に戻し、Codex を新規 session で起動できるようにしました。

### 4.6 heartbeat 長時間待機への対処

Codex の heartbeat が空 inbox で長く継続しすぎないよう、agent config に timeout を設定しました。

- `timeoutSec`: `180`
- `graceSec`: `15`

また、動作確認用に起動していた長時間 run は control plane から cancel しました。

## 5. 最終的に確認できたこと

今回の修正後、以下はすべて正常になりました。

### 5.1 Local agent 認証

Codex process 内で以下の環境変数が注入されることを確認しました。

- `PAPERCLIP_API_KEY`
- `PAPERCLIP_API_URL`
- `PAPERCLIP_AGENT_ID`
- `PAPERCLIP_COMPANY_ID`
- `PAPERCLIP_RUN_ID`

### 5.2 Codex の実行

Codex process は Paperclip 管理の `CODEX_HOME` を使って正常起動しました。

- `~/.paperclip/instances/default/companies/<companyId>/codex-home`

### 5.3 Codex からの API アクセス

Codex heartbeat 中に、以下の API 呼び出しが bearer token 付きで成功しました。

- `GET /api/agents/me`
- `GET /api/agents/me/inbox-lite`
- `GET /api/companies/{companyId}/issues`

これは「Codex 設定そのものは完了し、Paperclip の agent として正常に話せている」ことを意味します。

## 6. 今後の標準設定手順

今後、同じプロジェクトで Codex agent を設定する時は、以下の順序を標準手順にするべきです。

### 6.1 事前確認

1. `codex` CLI が入っていることを確認する

```sh
command -v codex
codex --version
```

2. Codex 認証があることを確認する

```sh
ls ~/.codex/auth.json
```

3. Paperclip instance が初期化済みであることを確認する

```sh
ls ~/.paperclip/instances/default/config.json
ls ~/.paperclip/instances/default/.env
ls ~/.paperclip/instances/default/secrets/master.key
```

不足していれば以下を実行すること。

```sh
pnpm paperclipai onboard --yes
```

### 6.2 サーバー起動

```sh
pnpm dev
```

ヘルスチェック:

```sh
curl http://127.0.0.1:3100/api/health
curl http://127.0.0.1:3101/api/health
```

fork では `3100` が埋まっていれば `3101+` にずれるため、実際に生きているポートを確認すること。

### 6.3 UI 上の設定

対象 agent に対して以下を設定する。

- Adapter: `codex_local`
- Model: `gpt-5.3-codex` または必要に応じて `gpt-5.4`
- `cwd`: 対象リポジトリのルート
- `instructionsFilePath`: managed instructions の `AGENTS.md`
- `search`: 通常は `off`
- `dangerouslyBypassApprovalsAndSandbox`: 初期検証時は `on`
- `timeoutSec`: 空 heartbeat での長時間待機防止のため `180` など明示設定

### 6.4 adapter 切り替え時の必須手順

既存 agent が `claude_local` など別 adapter から切り替わる場合、切り替え直後に必ず session をリセットする。

```http
POST /api/agents/:id/runtime-state/reset-session
```

これは今後の運用ルールとして固定すべきです。理由は、adapter 間で session 形式が互換である保証がないためです。

### 6.5 動作確認

1. adapter 環境テストを実行する
2. 対象 agent に 1 件 issue を割り当てる
3. heartbeat を invoke する
4. run log で以下を確認する

- Codex が起動している
- `PAPERCLIP_API_KEY` が注入されている
- `agents/me` や `inbox-lite` への API アクセスが成功している
- issue checkout と comment/status update まで進む

空 inbox の heartbeat だけでは、設定の正常性確認としては不十分です。必ず 1 件 assigned issue を用意して確認するのがよいです。

## 7. 再発防止策

### 7.1 設定チェックリスト化

Codex agent 作成前に、最低限次のチェックを行うこと。

- Paperclip instance 初期化済み
- dev server の実ポート確認済み
- `codex` CLI と認証確認済み
- adapter test-environment 成功済み
- adapter 切り替え時は session reset 実施済み
- `timeoutSec` 設定済み

### 7.2 切り替え運用ルール

`claude_local`、`codex_local`、`cursor_local` などの adapter 切り替え時は、常に以下をセットで行うべきです。

1. adapter 更新
2. runtime session reset
3. test-environment
4. assigned issue を使った heartbeat 検証

### 7.3 将来的に改善すべき実装点

今回の調査から、将来的には以下の改善価値があります。

1. `codex_local` への adapter 変更時に、Paperclip 側で自動的に session reset を促す
2. local agent JWT secret 未設定時に、UI 上で明示的な診断メッセージを出す
3. inbox 0 件の Codex heartbeat は、より早く自動終了するよう改善する
4. agent 作成 UI に「設定後セルフテスト」導線を設ける

## 8. 今回の結論

今回エージェントを設定できなかった主因は、Codex そのものではなく、Paperclip 側の local agent 実行基盤の初期化不足と、adapter 切り替え時の session 管理でした。

つまり、今後の正しい理解は次の通りです。

- Codex CLI の有無だけでは足りない
- Paperclip instance の onboarding が先に必要
- adapter 切り替え時には session reset が必要
- 動作確認は空 heartbeat ではなく、assigned issue を使って行うべき

この手順に従えば、今後同じプロジェクトで Codex agent を再現性高く設定できます。
