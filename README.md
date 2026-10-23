# Trailogue

このビルドは、現在のタブの会話を読み、全文プレビューとローカル保存と原文の再表示までを行う。思考経路とMarkdownのダウンロードはまだない。

## 使い方

保存したいCopilotまたはChatGPTの会話を開き、そのタブで拡張機能のボタンを押す。操作はどちらのページでも同じである。ボタンは同じURLを読み直してから取得する。読み直すと、入力中の文とスクロール位置は消える。popupはない。

`npm run build` のあと、EdgeまたはChromeの拡張機能ページで `.output/chrome-mv3` を読み込む。実ページでのボタン確認は、この読み込みのあとに行う。

## 開発

```sh
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

## 拡張の読み込み

`npm run build` のあと、EdgeまたはChromeの拡張機能ページで `.output/chrome-mv3` を読み込みます。popupはありません。

## 確認できた範囲

許可するのは次のHTTPS URLで、識別子は空でない1つのパスセグメントです。クエリとフラグメントは無視します。

- `https://copilot.cloud.microsoft/chat/conversation/{conversationId}`
- `https://copilot.cloud.microsoft/chat/share/{token}`
- `https://chatgpt.com/c/{conversationId}`
- `https://chatgpt.com/share/{shareId}`

adapterが依存している形式は次です。fixtureは実ページの保存HTMLではなく、この契約を確認する最小HTMLです。

- Copilot通常会話と共有会話: inline script の `window.__staticRouterHydrationData`。通常会話は `loaderData["chat-history"].store.rawConversationResponse`、共有会話は `loaderData["chat-share-redeem"].store.rawConversationResponse`。`author` は `user` と `bot`、本文は `text`、順は配列順。
- ChatGPT共有会話: `script#__WEB_MOBILE_DATA__` の `conversation.messages`。`role` は `user` と `assistant`、本文は `content`。
- ChatGPT通常会話: `data-chatgpt-search-message-ids`、見出し「あなたの発言:」、`data-conversation-role="assistant"`。ユーザー本文は `data-search-result-target`、assistant本文は `data-markdown-text-style="assistant-message"`。

Copilotの content script は `document_start` で hydration script のテキストを保持する。解釈と応答は、拡張機能のボタンによる取得要求のときだけ行う。ボタンは取得の前に同じURLを読み直すので、保持するのは読み直した最初のHTMLである。

## 未確認のprovider依存

- CopilotとChatGPTのサインイン画面。`login_required` 用のセレクタは置いていない。
- ChatGPT通常会話で長い会話が仮想化されたときの全件の取り方。`data-virtualized-turn-content` があるページは、同じURLを読み直しても `incomplete_conversation` になる。
- 読み直したCopilotの最初のHTMLに hydration script が無い場合。そのときは `incomplete_conversation` になる。

実ページの保存HTMLは、トークンや他の履歴を含むため fixture にしていない。
