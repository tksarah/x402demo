# x402 デモ（ローカル） と 想定される本来の x402 v2 の差分

この文書は、本リポジトリのデモ実装（疑似 x402、以降「本デモ」）と、想定される本番の x402 version2（以降「本来の x402 v2」または「本番」）との間で、ユーザーが体験できる部分と実装面での主な違いをまとめたものです。

## 1. 本デモで「体験できる」部分
- **UI / UX フロー**: 無料回答表示→詳細は 402（Payment Required）→支払い→詳細表示、という一連のフローはそのまま体験可能。
- **決済フローの疑似体験**: MetaMask 等の EVM ウォレットを使い、Soneium Minato テストネット上で 0.001 ETH を送金する操作を行い、送金操作と txHash を取得する体験ができる。
- **Service Worker による疑似API**: `sw.js` が疑似エンドポイント（`./api/risk-report`）を提供し、クライアント側で 402/200 の切替を行う体験を確認できる。
- **支払い状態の保持**: `localStorage` に `txHash` と送金元アドレスを保存し、リロード後も「支払い済み」として詳細を表示できる。

## 2. 本デモと本来の x402 v2 の主な違い（設計・信頼性・安全性）
以下は、本番システムで想定される要件や実装と、本デモが簡略化している/省略している点です。

- **サーバー側の信頼できる検証の有無**: 本来の x402 v2 ではサーバー側でトランザクション検証・受領確認・不正検知を行い、信頼できる付与トークン（例: サーバー署名済みのアクセス証明、JWT、発行レシート）をクライアントに返す。一方、本デモはService Worker（クライアント側）で RPC を叩いて検証するため、検証の信頼境界が低い（ローカル改変で迂回可能）。

- **支払いの不可逆性と資金管理**: 本番では資金の受け渡し、決済プロバイダ、戻金/紛争処理、会計監査などがあるが、本デモは単なるテストネット送金の体験であり資金管理や運用ルールを含まない（テストネットETHは無価値）。

- **認証・認可・本人性の担保**: 本来は購入者アカウント／ウォレットとサービスアカウントを結び付け、詐称防止や不正検出を行う。デモは `localStorage` と txHash の紐付けだけで、送金者の真正性・権限照会が不十分。

- **オンチェーン検証の強度**: 本来はブロック確認数（confirmations）や Receipt の確定判定、最終性の担保、再編（reorg）対策がサーバー側で設計される。デモは簡易に Receipt を確認するだけで、最終性の扱いが甘い。

- **支払いプロトコルの標準化（x402 v2 の仕様）**: 本来の仕様では、API レベルで 402 応答に対する支払い要求と支払い結果の照合方法、返却すべきメタデータ、狭義の署名・パラメータ形式などが標準化される想定。デモはアプリ固有の相互運用しない簡易仕様である。

- **監査・ログ・不正検知**: 実運用ではログ集約、異常検知、レート制限、再試行や不正トランザクションの遮断などが必要。デモにはこれらの運用設計は実装されていない。

- **法務／コンプライアンス**: 金融取引に関連する KYC/AML、税務処理などは本番で考慮が必要。本デモは教育用でこれらを一切扱わない。

## 3. 技術的な違い（実装の簡易化点）
- **クライアント完結の検証**: デモは Service Worker + client-side RPC 検証で済ませている。実運用ではサーバーが RPC を呼び、信頼ノードで二重検証する。
- **状態保存の方法**: デモは `localStorage` に支払い情報を保存するのみ。実運用では DB に保存し、セッションやアカウント単位で永続化・紐付けを行う。
- **CORS / RPC の制約回避**: デモは公開 RPC（例: https://rpc.minato.soneium.org）を直接叩く。実運用では自前ノードやプロキシ、CORS ポリシーを管理する必要がある。
- **ネットワーク**: デモはテストネット（Soneium Minato）を使用。本番はメインネットや決済向けの許容済みネットワークを使うため、ガス費やユーザー負担が実際に発生する。

## 4. セキュリティとプライバシー面の差分
- **改ざん耐性**: `localStorage` とクライアント検証は改ざん可能。本来はサーバー側の署名トークンや短期有効トークンを返却し、改ざんを防止する。
- **ミドルマン・リプレイ攻撃対策**: 本番では nonce/タイムスタンプや署名でリプレイを防止するが、デモはそうした対策を持たない。

## 5. 移行時の推奨作業（デモ → 本来の x402 v2 相当へ）
1. **サーバーサイド検証の追加**: 受け取った txHash をサーバーへ送信し、信頼ノードでトランザクションと Receipt（確認数含む）を検証する。
2. **アクセストークン設計**: 支払いが確認できたらサーバーで署名したアクセス証明（短期 JWT など）を発行し、以後のリクエストで提示させる。
3. **永続ストレージの導入**: 支払い履歴、ユーザー紐付け、返金・監査ログを DB で管理する。
4. **最終性の扱い**: 必要確認数を定め、再編対策を実装する（例: 3–12 確認を待つポリシーの適用）。
5. **運用・監視の強化**: モニタリング、アラート、レート制限、不正検知を導入する。
6. **法務対応の検討**: KYC/AML、税対応、利用規約/プライバシーポリシー整備。

## 6. 運用上の注意（本デモ固有）
- **HTTPS 必須**: Service Worker は HTTPS（または `http://localhost`）でのみ動作する。`file://` では動かない。
- **Service Worker のキャッシュ**: `sw.js` のキャッシュにより更新が反映されない可能性がある。運用時は `Cache-Control` やファイル名バージョニングを利用する。
- **RPC 到達性 / CORS**: 公開 RPC の到達性や CORS 制限により検証が失敗することがある。代替ノードやサーバー側プロキシを準備すること。

## 7. 参照ファイル
- [index.html](index.html)
- [app.js](app.js)
- [sw.js](sw.js)
- [styles.css](styles.css)

---
この `diff.md` はデモと本番仕様の差分を技術的観点と運用観点の双方からまとめたものです。実運用へ移行する際のチェックリストや設計ノートとしてご利用ください。

## 8. 追記：サーバー側検証フロー（推奨シーケンス）
以下は、`localStorage`／Service Worker によるクライアント完結検証ではなく、信頼できるサーバー側で支払いを検証し、アクセストークンを発行するための簡易フロー例です。

1. クライアントが支払いを行い、`txHash` を取得してサーバーへ送信。
	 - POST `/api/payments/verify` { txHash, from }
2. サーバーは受け取った `txHash` を自前ノードまたは信頼ノード（RPC）で照会。
	 - `tx = provider.getTransaction(txHash)` が存在するか確認
	 - `receipt = provider.getTransactionReceipt(txHash)` を取得
3. 確認数（confirmations）をチェック。必要確認数に満たない場合は保留（202/PENDING を返す）。
4. `receipt.to` と `receipt.value`（またはログ）で支払い先／金額を検証。
5. 不正でなければ、サーバー側で支払い記録を DB に永続化し、短期の署名付きアクセストークンを発行して返す（例：JWT あるいは署名済みレシート）。
6. クライアントは以後の API リクエストでそのトークンを提示し、サーバーはトークンを検証して有料コンテンツを返す。

擬似的な Node.js 風サーバー側ステップ（概念コード）：

```js
// 省略: express, ethers provider 初期化
app.post('/api/payments/verify', async (req, res) => {
	const { txHash, from } = req.body;
	const tx = await provider.getTransaction(txHash);
	if (!tx) return res.status(404).json({ error: 'tx not found' });
	const receipt = await provider.getTransactionReceipt(txHash);
	if (!receipt || receipt.confirmations < REQUIRED_CONF) {
		return res.status(202).json({ status: 'pending', confirmations: receipt?.confirmations || 0 });
	}
	if (receipt.to.toLowerCase() !== EXPECTED_ADDRESS.toLowerCase()) {
		return res.status(400).json({ error: 'invalid recipient' });
	}
	if (receipt.value.lt(ethers.utils.parseEther('0.001'))) {
		return res.status(400).json({ error: 'insufficient amount' });
	}
	// DB に保存 -> JWT 発行
	const token = issueSignedToken({ sub: from, txHash, amount: '0.001' });
	return res.status(200).json({ accessToken: token, expiresIn: 3600 });
});
```

## 9. API スキーマ例（参考）
- 402 レスポンス（クライアントが未払いのとき）

```json
{
	"status": 402,
	"code": "payment_required",
	"payment": {
		"chainId": 1946,
		"to": "0xbe587b30a5514C7866b3C0EFE08e93b7c3D5BE14",
		"amount": "0.001",
		"currency": "ETH",
		"memo": "optional"
	},
	"instructions": "Use your EVM wallet to send 0.001 ETH to the address above."
}
```

- 支払い完了通知（Webhook）例: サーバーが外部サービスへ通知する場合

POST `/webhooks/payment`

Body:
```json
{
	"txHash": "0x...",
	"from": "0x...",
	"to": "0x...",
	"value": "0.001",
	"confirmations": 6,
	"status": "confirmed"
}
```

ヘッダー例: `X-Signature` に HMAC-SHA256 またはサーバーの署名を付与して検証可能にする。

## 10. セキュリティ強化ポイント（具体）
- **トークン署名**: サーバーは秘密鍵でトークン／レシートに署名し、クライアントはサーバー公開鍵で検証する。短期有効（例: 1時間）。
- **確認数ポリシー**: 取引の最終性を担保するため `REQUIRED_CONF`（例: 3~12）を設定。
- **リプレイ防止**: トークンや webhook に nonce/timestamp を含め、受信側で使い回しを拒否する。
- **ウェブフック署名**: 外部通知は署名付与で真正性を担保。
- **レート制限／異常検知**: 同一ウォレットからの大量リクエストや不審な tx をブロック。
- **監査ログ**: 支払い検証の全ステップを監査ログとして保存（txHash, receipt, 発行トークン, IP, タイムスタンプ）。

## 11. 運用メモ（追記）
- **Service Worker のキャッシュ問題対処**: ブラウザで SW を unregister、もしくは `sw.js` を `Cache-Control: no-cache` で配信する。手動手順例：

```bash
# ブラウザ DevTools -> Application -> Service Workers -> unregister
```

- **Receipt 未確定時のデバッグ**: Receipt 確認が不安定な場合は、ブロックエクスプローラーで `txHash` を確認して、`confirmations` の推移を観察する。
- **RPC 代替案**: 公開 RPC が不安定なら自前ノード、Infura/Alchemy 等の商用 RPC、あるいはサーバー側でプロキシを用意する。

## 12. 用語統一
- 本書では `本デモ` をローカル/フロントエンド中心の実装、`本来の x402 v2` または `本番` をサーバー検証・運用を含む実装想定として区別しています。

---
更新済み: サーバー検証フロー、API スキーマ例、具体的なセキュリティ・運用メモを追記しました。
