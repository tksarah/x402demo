# x402 デモ

バージョン: β v0.0.1

## 概要
このリポジトリは、「x402（Payment Required）」の概念を体験できるシンプルなデモです。
「支払いが必要な情報アクセス」をブロックチェーン決済で疑似体験できます。

---

- ## 仕様

- **バージョン**: β v0.0.1
- **目的**: x402（Payment Required）の概念をブラウザ上で疑似体験するデモアプリ。
- **主要機能**: 無料の回答表示、支払い（疑似）後に詳細を表示するフロー（疑似 402 → 200）。
- **プラットフォーム**: モダンブラウザ（Service Worker と secure context が必要）。
- **支払い（疑似）**:
  - チェーン: Soneium Minato (testnet)
  - chainId: `1946` (0x79a)
  - RPC: `https://rpc.minato.soneium.org`
  - 受取先: `0xbe587b30a5514C7866b3C0EFE08e93b7c3D5BE14`
  - テスト金額: `0.001 ETH`
- **保存場所**: 支払い情報は `localStorage` に保存（payer, txHash, 支払い済フラグ）。
- **疑似API**: `/api/risk-report` を Service Worker がフェイク実装し、支払い状態に応じて 402/200 を返す。
- **セキュリティ / 注意点**: Service Worker は HTTPS（または `http://localhost`）でのみ動作。`file://` での動作不可。
- **実行方法（最小）**: `index.html` を HTTPS 環境で配信するか、ローカルで簡易サーバを立ててブラウザで開く。
- **主要ファイル**:
  - `index.html` — UI
  - `styles.css` — スタイル
  - `app.js` — フロントエンドの疑似 402/200 ロジック
  - `sw.js` — Service Worker（疑似API 実装）
- **制約/既知の問題**: RPC到達性や Receipt 確定タイミングにより支払い反映に遅延が起きる可能性あり。Service Worker キャッシュに注意。


## デモ内容
- 問題：「ブロックチェーンの生みの親とされているのは何者か？」
- 回答：「サトシ・ナカモト」
- 回答の詳細（支払い後のみ表示）：
   「サトシ・ナカモトとは、ビットコインとブロックチェーンを創造し、世界の金融史を根底から変えたにもかかわらず、その正体を完全に隠し通した“匿名の天才”です。
    彼は2008〜2010年のわずか数年だけ姿を現し、革命を起こした後、静かに姿を消しました。」

---

## ブロックチェーン決済（拡張仕様：デモ）

疑似 402/200 の「支払い」を、**Soneium Minato（テストネット）上の送金**で実際に行えるように拡張しています。

### 支払い条件
- チェーン：Soneium Minato（testnet）
- chainId：`1946`（`0x79a`）
- RPC：`https://rpc.minato.soneium.org`
- 受取先：`0xbe587b30a5514C7866b3C0EFE08e93b7c3D5BE14`
- 金額：`0.001 ETH`

### 必要なもの
- EVMウォレット（例：MetaMask）
- Soneium Minato のテストネットETH（送金手数料＋0.001 ETH）

※本デモでは、送金後に得られる `txHash` と送金元アドレスを `localStorage` に保存し、Service Worker がRPCでTx/Receiptを検証して 402/200 を返します。

---

## デモの流れ
1. 「回答を見る」ボタンを押す
2. 回答（「サトシ・ナカモト」）が表示される
3. 詳細を見ようとすると **402 Payment Required** が表示される
4. 「支払う」ボタンでブロックチェーン決済（Soneium Minato テストネット / 0.001 ETH）
5. 支払い後に「詳細を見る」を押すと、詳細が表示される

---

### 表示される内容

- 回答（無料）：
  サトシ・ナカモト

- 回答の詳細（支払い後）：
  サトシ・ナカモトとは、ビットコインとブロックチェーンを創造し、世界の金融史を根底から変えたにもかかわらず、その正体を完全に隠し通した“匿名の天才”です。
  彼は2008〜2010年のわずか数年だけ姿を現し、革命を起こした後、静かに姿を消しました。

---

## 技術構成
- **HTML / CSS / JavaScript のみ**
- **外部 API 不使用**
- **疑似 402 / 200 の制御はフロントエンドで実装**
- **支払い状態は localStorage に保存**
- **Ubuntu サーバーは静的ファイル配信のみで動作**

---

## 実行方法（ブラウザのみ）

1. [index.html](index.html) をブラウザで開く
2. 文章を入力し、「詳細リスク診断を実行」を押す
3. 未払いの場合は 402 が表示されるので、「支払う」→「詳細を見る」
4. 支払い状態は `localStorage` に保存され、リロードしても維持される

### ファイル構成
- [index.html](index.html)：画面
- [styles.css](styles.css)：スタイル
- [app.js](app.js)：疑似 402/200 ロジック（支払い状態は localStorage）
- [sw.js](sw.js)：疑似 API（/api/risk-report）を Service Worker で実装

### Service Worker 版の注意
- Service Worker は `file://` で開いたページでは動作しません。
- さらに、Service Worker は **セキュアコンテキスト**（原則 HTTPS。例外として `http://localhost`）でないと動作しません。
- 本デモの「疑似 API（./api/risk-report）」による 402/200 を体験するには、Ubuntuサーバー等で静的配信された **HTTPS URL** で開いてください。

---

## Ubuntu 静的配信での配置メモ

### 置き方（最小）
- 同一ディレクトリに [index.html](index.html) / [styles.css](styles.css) / [app.js](app.js) / [sw.js](sw.js) を配置します。
- サブパス配備（例 `https://example.com/x402demo/`）でも動くよう、疑似APIは相対パス（`./api/risk-report`）で実装しています。

### ハマりどころ
- **HTTPS必須**：`http://example.com/...` のような非HTTPS配信だと Service Worker が登録されず、疑似APIによる402/200は動きません。
- **sw.js のキャッシュ**：更新反映が遅い場合は、`sw.js` だけ `Cache-Control: no-cache` にする（もしくはファイル名にバージョンを付ける）とデモ運用が安定します。

---

## GitHub Pages でのメモ

- GitHub Pages は HTTPS 配信のため、本デモの Service Worker 版（疑似APIの402/200）が動作します。
- 初回アクセス時は Service Worker のインストール・有効化に少し時間がかかるため、本デモでは「Service Worker 準備中」の間はボタンを無効化し、必要に応じて初回のみ自動リロードして安定化します。

### 公開手順（最小）

1. このリポジトリを GitHub に push
2. GitHub の `Settings` → `Pages`
3. `Build and deployment` → `Source` を `Deploy from a branch` にする
4. `Branch` を `main`（または `master`）/ `/(root)` にして `Save`
5. 表示される URL（例：`https://<user>.github.io/<repo>/`）へアクセス

### 確認ポイント

- 画面上部の `Service Worker：有効` が表示されてから「詳細リスク診断を実行」を押す
- MetaMask などで `chainId 1946（0x79a）` のネットワークを選択（未追加の場合は追加）
-- `支払う` で 0.001 ETH を送金 → `詳細を見る` を押して詳細が返ればOK

### よくある問題

- **更新したのに挙動が変わらない**：Service Worker のキャッシュが原因のことがあります。強制リロード（ハードリロード）や、ブラウザの「サイトデータ削除」を試してください。
-- **送金直後に 402 のまま**：Receipt がまだ確定していない可能性があります。数秒待って `詳細を見る` を押してください。
- **RPC検証に失敗**：`https://rpc.minato.soneium.org` への到達性や CORS 制限の影響があり得ます（別回線/別ブラウザでの確認も有効）。
- **支払い状態が残って詰む**：画面上部の「状態をリセット」で `localStorage` 上の支払い情報（payer/txHash/支払い済みフラグ）をクリアできます。

---

## 想定される利用シーン
- x402 の概念説明  
- エグゼクティブ向けのデモ  
- 事業開発の初期議論  
- 決済連動型 API の未来像の提示  
- AI × API × マイクロペイメントの体験デモ  

---

## ライセンス
MIT License
