# Trailogue

このビルドは実装準備の土台です。拡張機能のボタンはダッシュボードを開きます。会話の取得結果は保存せず、プレビュー、思考経路、Markdownのダウンロードはまだありません。

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

ページ判定だけを確認しています。許可するのは次のHTTPS URLで、識別子は空でない1つのパスセグメントです。クエリとフラグメントは無視します。

- `https://copilot.cloud.microsoft/chat/conversation/{conversationId}`
- `https://copilot.cloud.microsoft/chat/share/{token}`
- `https://chatgpt.com/c/{conversationId}`
- `https://chatgpt.com/share/{shareId}`

## 未確認のprovider依存

adapterはページ構造を解釈しません。対応URLでも `unrecognized_structure` を返し、本番セレクタも成功fixtureも置いていません。`tests/fixtures` は空です。

未確認のままにしているものは次です。

- Copilot通常会話のDOMと埋め込み形式
- ChatGPT通常会話のDOMと埋め込み形式
- ChatGPT共有会話のDOMと埋め込み形式

Copilot共有ページでは、inline scriptの `window.__staticRouterHydrationData` に構造化会話が入る例を別途確認しています。このビルドはその解釈を含みません。実ページの保存HTMLは、トークンや他の履歴を含むためfixtureにしていません。
