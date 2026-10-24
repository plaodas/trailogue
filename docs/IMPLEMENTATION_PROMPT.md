# Cursor実装プロンプト

新しいCursorチャットの先頭に、この文書の「プロンプト」をそのまま渡す。

## プロンプト

Trailogueを、このリポジトリに実装してください。作業前に次を読み、実装中の判断はこれらを優先してください。

- `AGENTS.md`
- `docs/METHOD.md`
- `docs/ARCHITECTURE.md`

矛盾、fixtureから確認できないproviderのDOM、仕様に無い機能追加で止まった場合は、推測で広げずに報告してください。

### 成果物

Microsoft CopilotとChatGPTで現在開いている通常会話または共有会話を、ログイン済みブラウザから取得してローカル保存するEdge / Chrome拡張を完成させてください。

利用者は保存したい会話タブで拡張機能のボタンを押します。Trailogueはページ遷移せず、そのタブのDocumentから会話全体を構造化して取得し、ダッシュボードに保存前の全文プレビューを出します。保存後は原文の再表示、時系列の思考経路、Markdown書き出しができます。

### 技術制約

- WXT、React、TypeScript strict、Dexie、Vitest、React Testing Library、happy-dom、fake-indexeddbを使う
- npmを使う
- ブラウザ操作のボタンは現在のタブへ取得要求を送り、結果を表示するダッシュボードタブを開く。popup UIは作らない
- content scriptは静的登録にし、Copilotの `/chat/conversation/*` と `/chat/share/*`、ChatGPTの `/c/*` と `/share/*` だけに一致させる。明示的な取得要求が無ければ何もしない
- adapterが通常会話または共有会話の既知構造を認識したページだけを取得する
- HTML解釈は `src/providers` に隔離し、`parse(document, url)` をfixtureでテストする
- 取得セッションの分岐は純粋関数としてテストする
- 発言本文は前後空白と改行のLF化以外を変更しない
- 埋め込み会話データを優先し、仮想DOMの一部分だけを会話全体として成功させない
- 思考経路とMarkdownは `Conversation` から毎回生成する
- 同一内容ハッシュは保存しない。同じ会話でも内容が違えば古い記録を残して追加する
- 画面の既定は保存本文のpre-wrapにする。Markdown描画を入れる場合は生HTMLを無効化し、sanitizeする

### 実装しないこと

- CopilotとChatGPT以外のprovider
- バックエンド、アカウント、クラウド同期、共同編集、全文検索
- LLMによる要約、分類、タイトル生成、経路の解釈
- 任意ホストの取得、provider APIへの追加リクエスト、Cookieまたはトークンの保存
- `<all_urls>`、`cookies`、`scripting` 権限
- ページ全体のinnerTextを会話として保存すること
- 仮想スクロールに現在描画された一部分だけを会話全体として保存すること
- 取得失敗、空会話、構造不明を成功として保存すること
- 既存の記録の上書きと、利用者の明示以外の削除
- 画像、添付ファイル、参照先のMicrosoft 365ファイルのダウンロード
- 取得元タブを遷移または自動で閉じること
- Chat ExporterまたはbAInderのFork、および検索、分類、要約、画像、音声、会話比較の移植

### 進め方

取得器は `parse(document, url)` から `RawCapture` を返す交換可能な境界で止めてください。既存プロダクトのリポジトリはForkせず、UI、保存、思考経路もそこから持ってきません。

[Chat Exporter](https://github.com/talktome8/chat-exporter)（MIT）は、provider分離、文書順、完全と部分の区別、fixtureテストの参考だけに使います。DOMをMarkdownへ変換して保存する処理、`copilot.microsoft.com` のセレクタ、汎用フォールバックは採用しません。コードを写した場合は出典と著作権表示を残します。

[bAInder](https://github.com/Veverke/bAInder) は参照もしません。MITにCommons Clauseが付き、Non-Goalsの機能が本体に混ざっています。

取得契約がfixtureで固定できたら、以降の実装時間はProduct Principlesへ使ってください。具体的には、発言を削除・要約せず、同じ会話の変化を世代として残し、全文から思考経路を導出します。

### 段階

各段階の条件を満たしてから次へ進んでください。

1. 基盤とdomain
   - WXTプロジェクト、strict TypeScript、ディレクトリ境界を作る
   - 正規化、内容ハッシュ、タイトル決定、思考経路の導出を単体テストする
2. provider取得
   - CopilotとChatGPTのadapterを作る
   - 実ページで確認できた通常会話と共有会話について成功fixtureを置き、サインイン画面、空会話、会話不完全、構造不明のfixtureを各providerに置く
   - 実ページで未確認の通常会話または共有会話は、fixtureや本番セレクタを推測で作らず未対応として記録する
   - 失敗fixtureが成功結果を返さないことをテストする
   - content scriptは取得要求にだけ応答する
3. 保存と閲覧
   - 現在のタブの検証、取得要求、サインイン待ち、ダッシュボードのプレビューを実装する
   - 利用者が選んだフォルダへ `Conversation` のJSONを書き、そのファイルが書けたときを保存完了とする
   - 同じJSONから原文を再表示する。IndexedDBは作業用であり、空でもフォルダから戻せる
   - 同一ハッシュはファイルを上書きしない。同じ会話で内容が違う場合は別ファイルとして残す
4. 経路と書き出し
   - 全発言を省略せず並べる思考経路を実装する
   - Markdownをダウンロードでき、保存失敗時もプレビューから書き出せるようにする
5. 検証
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - READMEへ、手動確認手順、確認した拡張の読み込み方法、adapterが依存している通常会話・共有会話のDOMまたは埋め込み形式を記録する

fixtureが実ページの保存HTMLではなく、契約確認用に作った最小HTMLであることはREADMEに明記してください。実ページと違うセレクタを、実機確認なしの本番セレクタとして扱わないでください。保存HTMLに含まれるconversation transfer token、reconnect token、他のチャット履歴、プロフィール画像などをfixtureへ入れないでください。

### 完了条件

- CopilotまたはChatGPTで現在開いている対応会話から、プレビュー、ローカル保存、再表示、思考経路、Markdown書き出しまで到達する
- 対応外ホストと、対応ホスト内の会話ではないページを保存しない
- サインイン待ちを自動タイムアウトで失敗にせず、取得元タブを遷移しない
- 発言の脱線や役割不明を削除しない
- 全発言を確認できない部分取得を成功にしない
- lint、typecheck、unit test、拡張のbuildが成功する
- READMEに、実URLで確認できた範囲と、未確認のprovider依存を分ける

実ページによる確認は、利用者が拡張をブラウザへ読み込める状態まで実装したあとで行ってください。通常会話と共有会話を分け、確認できないページ形式を確認済みと書かないでください。
