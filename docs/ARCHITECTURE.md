# アーキテクチャ

取得手順と失敗時の表示は [方法](METHOD.md) に従う。この文書は、その手順をどの境界で実装するかを固定する。

## 全体像

```mermaid
flowchart LR
    Tab["Current conversation tab"] --> Action["Extension action"]
    Action --> Adapter["Provider content-script adapter"]
    Adapter --> Capture["Raw structured capture"]
    Capture --> Normalize["Conversation normalizer"]
    Normalize --> Dashboard["Extension dashboard preview"]
    Dashboard --> Archive["Chosen folder JSON"]
    Archive --> Store["IndexedDB working copy"]
    Archive --> Reader["Conversation reader"]
    Archive --> PathView["Thought path view"]
    Archive --> Exporter["Markdown exporter"]
```

ダッシュボード、原文、思考経路、Markdownは、同じ `Conversation` を読む。保存の正本は、利用者が選んだフォルダのJSONである。経路とMarkdownは保存せず、その `Conversation` から表示または書き出しのたびに作る。

## 技術

- WXT
- React
- TypeScript strict
- Dexie / IndexedDB
- Vitest
- React Testing Library
- happy-dom
- fake-indexeddb

パッケージマネージャはnpmを使う。バックエンド、ホスト型データベース、LLM APIは置かない。

ブラウザ操作のボタンはpopupを持たない。対応会話タブでクリックしたら、そのタブを同じURLで読み直し、読み直し完了後に取得要求を送る。`dashboard.html` を通常タブで開き、結果を表示する。ダッシュボードが既に開いていれば、そのタブを前面にする。別のURLへは移さず、取得元タブの開閉はしない。読み直すと、入力中の文とスクロール位置は消える。

## 依存の方向

```mermaid
flowchart TD
    ui["src/ui"] --> capture["src/capture"]
    ui --> storage["src/storage"]
    ui --> archive["src/archive"]
    ui --> exportMd["src/export"]
    ui --> domain["src/domain"]
    capture --> domain
    storage --> domain
    archive --> storage
    archive --> domain
    exportMd --> domain
    providers["src/providers"] --> domain
    entry["entrypoints"] --> providers
    entry --> ui
```

`src/domain` はブラウザAPI、DOM、Dexie、Reactをimportしない。`src/providers` はDexieとReactをimportしない。providerのHTML解釈は `src/providers` の外へ出さない。

## ディレクトリ

```text
entrypoints/
  background.ts
  dashboard/
    index.html
    main.tsx
    App.tsx
  copilot.content.ts
  chatgpt.content.ts
src/
  domain/
    types.ts
    normalize.ts
    hash.ts
    thoughtPath.ts
    title.ts
  providers/
    copilot/adapter.ts
    chatgpt/adapter.ts
  capture/
    page.ts
    session.ts
  storage/
    db.ts
    repository.ts
  archive/
    conversationFile.ts
    fileSystemArchive.ts
  export/
    markdown.ts
  ui/
tests/
  fixtures/copilot/
  fixtures/chatgpt/
```

content scriptの入口は薄く保つ。明示的な取得要求を受けたときだけ `parse(document, url)` を呼び、結果を返す。Copilotの content script はそれに加えて `document_start` で hydration script のテキストを保持する。保持は取得でも保存でもない。HTML解釈のテストは、この純粋関数へfixtureのDocumentを渡して行う。

adapterの外へ出るものは `RawCapture` か失敗コードだけである。取得器は交換でき、保存、正規化、思考経路、MarkdownはproviderのDOMを知らない。既存の会話エクスポーターはForkせず、そのMarkdown変換、汎用セレクタ、部分取得の成功もこの境界へ入れない。進め方は [AGENTS.md](../AGENTS.md) に従う。

## manifest

静的なcontent scriptだけを使う。任意コードの実行権限は要らない。content scriptのmatchは、実ページで確認した通常会話と共有会話のパスに限定する。host permissionのmatch patternではpathによる権限制限が保証されないため、対応providerのoriginだけを許可する。

```ts
manifest: {
  name: "Trailogue",
  description: "答えではなく、たどり着き方を残す。",
  action: {},
  permissions: ["tabs"],
  host_permissions: [
    "https://copilot.cloud.microsoft/*",
    "https://chatgpt.com/*",
  ],
}
```

content scriptの一致パターンも同じ4形式に限る。

- `https://copilot.cloud.microsoft/chat/conversation/*`
- `https://copilot.cloud.microsoft/chat/share/*`
- `https://chatgpt.com/c/*`
- `https://chatgpt.com/share/*`

match patternは末尾の追加パスも包含しうるため、`src/capture/page.ts` で識別子が空でない1セグメントだけであることを検証する。クエリとフラグメントは判定から除外する。

`cookies`、`scripting`、`<all_urls>` は宣言しない。content scriptが読み込まれても自動取得はせず、URL形式または既知の会話構造に一致しないページは `unsupported_page` にする。拡張機能はCookie、トークン、providerのlocalStorageを読まない。

## データモデル

```ts
type ProviderId = "copilot" | "chatgpt";
type SourceKind = "conversation" | "shared";
type MessageRole = "user" | "assistant" | "unknown";

type RawMessage = {
  ordinal: number;
  role: MessageRole;
  content: string;
  providerMessageId?: string;
};

type RawCapture = {
  provider: ProviderId;
  sourceUrl: string;
  sourceId: string;
  sourceKind: SourceKind;
  title: string | null;
  parserVersion: string;
  messages: RawMessage[];
};

type Message = {
  id: string;
  ordinal: number;
  role: MessageRole;
  content: string;
  providerMessageId?: string;
};

type Conversation = {
  id: string;
  provider: ProviderId;
  sourceUrl: string;
  sourceId: string;
  sourceKind: SourceKind;
  title: string;
  capturedAt: string;
  parserVersion: string;
  contentHash: string;
  messages: Message[];
};

type ThoughtNode = {
  id: string;
  ordinal: number;
  role: MessageRole;
  messageId: string;
};
```

`Message.id` は、その記録の中で安定であればよい。providerの発言IDが無い場合はordinalから作る。順序の正本は `ordinal` である。

`Conversation.id` はローカルのUUIDである。`capturedAt` は保存時のISO 8601 UTCである。

## 正規化とハッシュ

normalizerは `RawCapture` を `Conversation` の保存前データへ変える。

- `ordinal` の昇順に並べ、0から振り直す
- 各本文の前後空白を除く
- 改行をLFへ揃える
- それ以外の本文は変えない
- 空になった本文の発言も削除しない
- タイトルは [方法](METHOD.md) の優先順で決める

内容ハッシュは、次のcanonical JSONをUTF-8で符号化したSHA-256の小文字16進である。

```ts
JSON.stringify({
  v: 1,
  provider,
  sourceId,
  messages: messages.map((message) => ({
    ordinal: message.ordinal,
    role: message.role,
    content: message.content,
  })),
})
```

ハッシュに含めないものは `id`、`title`、`capturedAt`、`parserVersion`、`sourceUrl`、`sourceKind` である。`sourceId` は含める。別の会話で本文が偶然同じでも、別の軌跡として残すためである。通常ページと共有ページから同じprovider会話IDを確認できた場合は、同じ `sourceId` になるため重複しない。`v` はハッシュ形式の版であり、parserの版とは別である。`v` を変えると同一会話が別記録になるため、変えるときは移行方法を同じ変更に含める。

同一 `contentHash` は1件だけ保存する。同じ `sourceId` でハッシュが違う記録は、別の `Conversation` として併存させる。

## 思考経路とMarkdown

`deriveThoughtPath(conversation)` は発言ごとに1ノードを返す。ノードは `messageId` で本文を参照する。ノード用の別本文は持たない。

Markdownは `toMarkdown(conversation)` の純粋関数で作る。ファイルはUTF-8、改行はLF、末尾改行を1つ付ける。

```md
# {title}

- Provider: {provider}
- Source: {sourceUrl}
- Captured: {capturedAt}
- Parser: {parserVersion}

---

**1. ユーザー**

{content}

---

**2. Copilot**

{content}
```

見出しの番号は、保存値 `ordinal` に1を足した表示順である。assistantの表示名は、providerがcopilotなら `Copilot`、chatgptなら `ChatGPT` とする。役割不明は `不明` とする。発言本文は引用符やコードフェンスで包まない。本文中のMarkdownをエスケープしない。これは忠実な書き出しであり、Trailogueが本文を整形し直す処理ではない。

画面の既定表示は、保存した本文のpre-wrapである。Markdown描画を追加する場合も元の本文は残し、生HTMLは無効にしてからsanitizeする。

## 保存

保存の正本は、利用者が一度選んだフォルダに置く `{contentHash}.json` である。中身は `Conversation` のJSON（UTF-8）であり、本文は変えない。ファイル名と中身の `contentHash` は、保存時と同じ計算で本文から出したSHA-256と一致するときだけ記録として読む。一致しないファイルは読まず、消さない。有効なファイルが既にあるときは書き直さない。同名でも検証に失敗するファイルだけ、保存する `Conversation` で書き直す。

この読み書きは `src/archive/conversationFile.ts` に置く。DOMもDexieも知らない。ダッシュボードは `ConversationArchive`（書く、ハッシュで探す、一覧する、フォルダを開く）を受け取る。Edge / Chromeの実装は `src/archive/fileSystemArchive.ts` で、ダッシュボードから `showDirectoryPicker` を使う。ディレクトリハンドルはIndexedDBに保持する。ハンドルが消えてもファイルは残る。権限があるときだけフォルダを自動で読む。権限が無いときは「記録フォルダを開く」で同じフォルダを選び直し、JSONを読んで一覧と作業用記録を戻す。Chromeは再起動後に権限の再確認を求めることがある。

初めてフォルダを選んだとき、作業用記録にあってファイルが無いものをその場で書き出す。一覧は、フォルダが読めるときはファイルを正とする。権限が無いあいだは作業用の一覧を出し、フォルダが未接続であることを示す。

作業用データベース名は `trailogue` とする。Dexieのschema versionは2とする。`conversations` の索引はversion 1のままである。

```ts
conversations: "id, provider, sourceId, &contentHash, capturedAt"
archiveHandles: "id"
```

`archiveHandles` はversion 2で足す。中身は選んだフォルダのハンドル1件である。repositoryは `Conversation` だけを受け取る。挿入前にハッシュで検索し、既存があれば既存を返す。物理削除と上書き更新はMVPの操作に含めない。Dexieへの挿入は、フォルダへ書けたあとで行う。

未保存プレビューはReactの状態に置く。フォルダに書けなかったあとでも、その状態から `toMarkdown` を呼べるようにする。経路とMarkdownは、ファイルから読んだ `Conversation` から毎回作る。

## adapter契約

各adapterは `parserVersion` を持つ。Copilotの初期値は `copilot-1`、ChatGPTの初期値は `chatgpt-1` とする。DOMや埋め込み形式を変えて解釈を直すときは、この値を上げる。

戻り値は成功時の `RawCapture` か、次の失敗である。

| code | 意味 |
| --- | --- |
| `login_required` | サインイン画面であり、会話はまだ無い |
| `not_ready` | 会話ページだが、会話の描画または埋め込みが未完了 |
| `empty_conversation` | 構造は認識し、発言が0件 |
| `incomplete_conversation` | 構造は認識したが、全発言を取得できない |
| `unrecognized_structure` | 読み込み済みだが、既知の構造に一致しない |
| `unsupported_page` | 対応ホスト外、または会話ページではない |

fixtureは、確認できた通常会話と共有会話の成功、空の会話、会話不完全、構造不明を用意する。成功fixtureは期待する役割、順序、本文と一致させる。失敗fixtureが `RawCapture` を返したらテストを失敗させる。サインイン画面は未確認のため、そのfixtureとセレクタは実物のHTMLが取れてから置く。

セレクタと埋め込み形式の解析は、fixtureで確認できたものだけを書く。確認できないCopilotの内部APIは推測で呼ばない。

Copilotは通常会話と共有会話のどちらも、inline script の `window.__staticRouterHydrationData = JSON.parse(...)` から読む。ページ側のJavaScript変数は見ない。代入されているJSON文字列だけを `JSON.parse` する。`eval` やページコンテキストへのコード注入は使わない。

- 通常会話: `loaderData["chat-history"].store.rawConversationResponse`
- 共有会話: `loaderData["chat-share-redeem"].store.rawConversationResponse`

使うのは `messages` の配列順、`author`（`user` はそのまま、`bot` は `assistant`、それ以外は `unknown`）、`text`、`messageId`、`chatName`、照合用の `conversationId` と `conversationDebugMetrics.messageCount` である。`text` が文字列のときはそれを本文にする。空文字も本文であり、カードは見ない。`text` が無く、`adaptiveCards` の各 `body` が `TextBlock` だけで `text` が文字列のときは、その文字列を出現順に改行でつなぐ。カードを Markdown へ組み替えない。`body` に `TextBlock` 以外がある、または `TextBlock.text` が文字列でないときは `incomplete_conversation` とする。`text` も読めるカードも無い発言は空の本文のまま残す。この読み方の版は `copilot-2` である。サイドバーの履歴や `loaderData.chat` は使わない。`messageCount` が配列長と違うときは `incomplete_conversation`、配列が0件のときは `empty_conversation` とする。通常会話では `conversationId` がURLのパス識別子と一致するときだけ採用し、`sourceId` はその識別子にする。共有会話で `conversationId` があるときはそれを `sourceId` にし、無いときはURLのパスセグメントを使う。共有トークンはデコードしない。

この script は `#root` の中にあり、Reactのハイドレーションで消える。`document_start` の時点ではまだ script が無いので、MutationObserver が script 要素の追加を見てテキストを残す。取得要求では Document 内の script を優先し、無ければ同じパスで保持したテキストを使う。別会話の保持分は捨て、`#m365-copilot-app-layout-root` だけがあるときは `incomplete_conversation` とする。仮想スクロール上の発言へはフォールバックしない。Document の `readyState` が `loading` で script もまだ無いときは `not_ready` とする。

共有ページでは、この hydration に全発言が入り、仮想化されたDOMには同時に一部のターンだけがある例を確認している。通常会話でも、最初のHTMLの `chat-history` に全発言があり、描画後のDOMは窓だけになる例を確認している。

ChatGPT共有会話は `script#__WEB_MOBILE_DATA__` の `conversation.messages` を読む。各要素の `content`、`role`（`user` と `assistant` 以外は `unknown`）、`id`、タイトルの `conversation.title` を使う。`userMessageCount` がユーザー発言数と違うときは `incomplete_conversation` とする。このJSONが読めたときは描画DOMを使わない。`sourceId` はURLの共有パスセグメントである。

ChatGPT通常会話で確認できたページには、本文の埋め込みが無く、仮想化も無かった。`data-chatgpt-search-message-ids` を文書順に読む。役割は `data-conversation-role="assistant"`、`data-chatgpt-search-unit-key` の末尾、または見出し「あなたの発言:」で決める。ユーザー本文は `data-search-result-target`、assistant本文は `data-markdown-text-style="assistant-message"` の表示テキストである。段落、リスト、コードブロックの表示テキストを含め、その要素の中にある `data-search-result-target` へ本文を切り替えない。assistant本文が空の発言があるときは、描画前の殻として `not_ready` とし、空の成功にしない。クラス名に `data-virtualized-turn-content` と書かれているだけでは仮想化とみなさない。属性としてその要素があるページは `incomplete_conversation` とし、スクロールでは集めない。この読み方の版は `chatgpt-2` である。タイトルは、サイト名 `ChatGPT` 以外の document title を使う。

サインイン画面のDOMは未確認なので、`login_required` を返すセレクタは置いていない。既知の構造が無い読み込み済みDocumentは `unrecognized_structure` である。

fixtureへはこの契約を再現する最小データだけを置く。conversation transfer token、reconnect token、他のチャット履歴、プロフィール画像を含む保存HTML全体は入れない。

## 画面

ダッシュボードは1つの拡張ページで、次を切り替える。

- 取得元タブの状態と保存済み一覧
- 保存前プレビュー
- 原文
- 思考経路
- Markdownの書き出し

一覧の各行は、タイトル、provider、取得日時、発言数を示す。同じ `sourceId` の記録が複数あれば、取得日時で区別する。

取得セッションの分岐は `src/capture/session.ts` の純粋関数に置く。現在のタブへ取得要求を送る処理、ダッシュボードを開く処理、2秒間隔の再取得は、その関数の結果を実行する側へ分ける。

## 検証

自動テストで固定するもの:

- 対応ホストと対象外ページの判定
- 正規化、ハッシュの安定性、同一ハッシュの重複判定
- 思考経路が全発言を順序どおり含むこと
- provider fixtureの成功と4種の失敗
- Markdownの全文が本文と一致すること
- repositoryが同じハッシュを2件挿入しないこと
- 検証済みJSONが同じ `Conversation` に戻ること。本文を変えたファイルは不採用になること
- 有効なファイルを上書きせず、検証に失敗した同名ファイルだけを置き換えること
- フォルダへ書けないとき、作業用記録へ挿入せずプレビューが残ること
- 作業用記録が空でも、フォルダのファイルから同一ハッシュと原文を戻せる
- 保存失敗後もプレビューからMarkdownを作れること

実装後の手動確認:

1. EdgeまたはChromeへ、ビルドした拡張を読み込む
2. Copilotで通常会話を開き、そのタブで拡張機能ボタンを押す。ボタンは同じURLを読み直す
3. プレビューの発言が会話全体の順序と本文に一致することを確認して保存する。初回の保存で記録フォルダを選ぶ
4. ダッシュボードを開き直し、原文、思考経路、Markdownを確認する
5. 同じ会話を再取得し、重複保存されないことを確認する。選んだフォルダのJSONが、拡張機能のデータを消したあとも開き直せて、同じ原文になることを確認する
6. Copilotの共有会話、ChatGPTの通常会話と共有会話で2から5を行う
7. providerのホーム、設定、一覧で実行し、保存されないことを確認する
8. 対応外ホストで実行し、ページを取得しないことを確認する

providerの埋め込み形式とDOMは予告なく変わる。手動確認で構造不明になった場合は、機密値を除いたfixtureを更新してadapterを直す。ページ全体のテキスト抽出や、仮想DOMに偶然存在する一部分へフォールバックして成功にしない。
