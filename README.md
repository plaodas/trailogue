# Trailogue

このビルドは、現在のタブの会話を読み、全文プレビュー、ローカル保存、原文の再表示、思考経路、Markdownのダウンロードまでを行う。

## 使い方

保存したいCopilotまたはChatGPTの会話を開き、そのタブで拡張機能のボタンを押す。操作はどちらのページでも同じである。ボタンは同じURLを読み直してから取得する。読み直すと、入力中の文とスクロール位置は消える。popupはない。保存するとき、記録を置くフォルダを一度選ぶ。以降の記録はそのフォルダのJSONである。拡張機能のデータを消しても、同じフォルダを開き直せば原文を戻せる。

実ページでのボタン確認は、下の手動確認で行う。

運用でボタンの読み直しが遅いと感じたら、読み直さずに今のページから取得する方へ変える。変更は [`src/capture/launch.ts`](src/capture/launch.ts) の `click` で、リロードを待たずすぐ取得を始める。CopilotとChatGPTで操作は一つにする。読み直すか読み直さないかは、そのときにどちらか一方へ決める。読み直さない場合、Copilotは今開いている文書の最初のHTMLを使う。そのタブの中で足した発言は、ページを自分で読み直すまで取得に入らない。

## 開発

```sh
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

## 手動確認

1. `npm run build` のあと、EdgeまたはChromeの拡張機能ページで `.output/chrome-mv3` を読み込む。popupはない。
2. Copilotの通常会話を開き、そのタブで拡張機能のボタンを押す。ボタンは同じURLを読み直す。
3. プレビューの発言が、会話全体の順序と本文に一致することを確認して保存する。初回の保存で記録フォルダを選ぶ。
4. ダッシュボードを開き直し、原文、思考経路、Markdownを確認する。選んだフォルダのJSONを、拡張機能のデータを消したあとに開き直して、同じ原文になることを確認する。
5. 同じ会話を再取得し、内容が同じなら新規保存されないことを確認する。
6. 発言を足してから再取得し、前の記録が残ったまま新しい記録として保存できることを確認する。
7. Copilotの共有会話、ChatGPTの通常会話、ChatGPTの共有会話で、2から6を行う。
8. CopilotまたはChatGPTのホーム、設定、一覧で実行し、保存されないことを確認する。
9. 対応外のホストで実行し、ページを取得しないことを確認する。

サインイン画面と、ChatGPT通常会話の長い仮想化は、この手順の確認済みには含めない。

## 確認できた範囲

許可するのは次のHTTPS URLで、識別子は空でない1つのパスセグメントです。クエリとフラグメントは無視します。

- `https://copilot.cloud.microsoft/chat/conversation/{conversationId}`
- `https://copilot.cloud.microsoft/chat/share/{token}`
- `https://chatgpt.com/c/{conversationId}`
- `https://chatgpt.com/share/{shareId}`

adapterが依存している形式は次です。fixtureは実ページの保存HTMLではなく、この契約を確認する最小HTMLです。

- Copilot通常会話と共有会話: inline script の `window.__staticRouterHydrationData`。通常会話は `loaderData["chat-history"].store.rawConversationResponse`、共有会話は `loaderData["chat-share-redeem"].store.rawConversationResponse`。`author` は `user` と `bot`、本文は `text`、順は配列順。
- ChatGPT共有会話: `script#__WEB_MOBILE_DATA__` の `conversation.messages`。`role` は `user` と `assistant`、本文は `content`。
- ChatGPT通常会話: `data-chatgpt-search-message-ids`、見出し「あなたの発言:」、`data-conversation-role="assistant"`。ユーザー本文は `data-search-result-target`、assistant本文は `data-markdown-text-style="assistant-message"`。assistant本文が空のとき、または発言がまだ無く同じ会話の入力欄と空の本文枠だけがあるときは描画待ちにし、空の発言として保存しない。

Copilotの content script は `document_start` で hydration script のテキストを保持する。解釈と応答は、拡張機能のボタンによる取得要求のときだけ行う。ボタンは取得の前に同じURLを読み直すので、保持するのは読み直した最初のHTMLである。

## 未確認のprovider依存

- CopilotとChatGPTのサインイン画面。`login_required` 用のセレクタは置いていない。
- ChatGPT通常会話で長い会話が仮想化されたときの全件の取り方。`data-virtualized-turn-content` があるページは、同じURLを読み直しても `incomplete_conversation` になる。
- 読み直したCopilotの最初のHTMLに hydration script が無い場合。そのときは `incomplete_conversation` になる。

実ページの保存HTMLは、トークンや他の履歴を含むため fixture にしていない。
