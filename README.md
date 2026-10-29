# Trailogue

このビルドは、現在のタブの会話を読み、全文プレビュー、ローカル保存、原文の再表示、思考経路、Markdownのダウンロードまでを行う。保存したフォルダは机で開き、本文と一致する箇所へ戻れる。

## 使い方

保存したいCopilotまたはChatGPTの会話を開き、そのタブで拡張機能のボタンを押す。操作はどちらのページでも同じである。ボタンは今開いているページから取得し、ページは読み直さない。入力中の文とスクロール位置は残る。popupはない。保存するとき、記録を置くフォルダを一度選ぶ。以降の記録はそのフォルダのJSONである。拡張機能のデータを消しても、同じフォルダを開き直せば原文を戻せる。

実ページでのボタン確認は、下の手動確認で行う。Copilotで、そのタブを開いたあとに足した発言を取り込むときは、ボタンを押す前にページを自分で読み直す。Copilotのサイドバーに出ている通常会話は、ダッシュボードの「Copilotのサイドバーの会話を順に取り込む」で、開始時にある識別子だけを1つのタブで順に保存する。保存できなかった会話は、開始時のタイトルと識別子を画面に残す。以前の記録は上書きしない。ChatGPTのサイドバーはこの操作の対象外である。見えている範囲だけでも成功になるため、順に開くと短い記録が別の記録として残る。

## 机

保存フォルダは、次で開く。

```sh
npm run desk -- <保存フォルダ>
```

`http://127.0.0.1:4737` に机が出る。入口は、最近採取した日、久しぶりの再会、地層の月である。表紙をめくり、開くと保存した本文が出る。開いた記録だけ、フォルダの `opened-marks` に印が付く。通過しただけの表紙には付かない。

「本文から探す」は玄関の上にある。欄が空のあいだ、入口はそのままである。文字を入れると、保存済み本文にその文字列を含む発言が、採取日の順に出る。出るのは一致した行の全文で、大文字と小文字は区別する。題名だけではヒットしない。選ぶと、その発言までスクロールして本文を開く。右下の「結果へ戻る」で同じ結果に戻る。欄を消すと玄関に戻る。

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
2. Copilotの通常会話を開き、そのタブで拡張機能のボタンを押す。ボタンはページを読み直さない。
3. プレビューの発言が、会話全体の順序と本文に一致することを確認して保存する。初回の保存で記録フォルダを選ぶ。
4. ダッシュボードを開き直し、原文、思考経路、Markdownを確認する。選んだフォルダのJSONを、拡張機能のデータを消したあとに開き直して、同じ原文になることを確認する。
5. 同じ会話を再取得し、内容が同じなら新規保存されないことを確認する。
6. 発言を足してから再取得し、前の記録が残ったまま新しい記録として保存できることを確認する。
7. Copilotの共有会話、ChatGPTの通常会話、ChatGPTの共有会話で、2から6を行う。
8. CopilotまたはChatGPTのホーム、設定、一覧で実行し、保存されないことを確認する。
9. 対応外のホストで実行し、ページを取得しないことを確認する。

Braveに読み込むと、ボタンにバッジとツールチップが出る。クリックしても取得せず、ダッシュボードはその一文だけである。

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
- ChatGPTの Export: `conversations.json`。`sourceId` は `conversation_id`。順は `current_node` から親をたどった現在の経路で、`content_type` が `text` の `parts` だけを残す。この読み方の版は `chatgpt-export-1` である。zip からは同名エントリだけを読む。

Copilotの content script は `document_start` で hydration script のテキストを保持する。保持するのは、今開いている文書の最初のHTMLである。そのタブの中で足した発言は、ページを自分で読み直すまで取得に入らない。ページを開いたときの照合もこの保持を読む。保存は、拡張機能のボタンを押したときだけ行う。

## 未確認のprovider依存

- CopilotとChatGPTのサインイン画面。`login_required` 用のセレクタは置いていない。
- ChatGPT通常会話で長い会話が仮想化されたときの全件の取り方。`data-virtualized-turn-content` があるページは `incomplete_conversation` になる。
- 今開いているCopilotの最初のHTMLに hydration script が無い場合。そのときは `incomplete_conversation` になる。

実ページの保存HTMLは、トークンや他の履歴を含むため fixture にしていない。
