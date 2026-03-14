/*
  Service Worker: 疑似 API を実装
  - /api/risk-report へのリクエストを捕捉し、402 / 200 を返す
  - 支払い状態はデモのため「リクエストヘッダ」で受け取る
*/

const API_PATH = new URL("./api/risk-report", self.registration.scope).pathname;

const PAID_REPORT = {
  report: `【高精度プロジェクトリスク診断レポート】

1. スケジュール遅延リスク
   - タスク見積もりの精度が低い
   - 依存関係の管理が不十分
   - クリティカルパスの監視が弱い

2. 要件変更リスク
   - ステークホルダー間の合意形成が不十分
   - 要件定義プロセスが形式化されていない
   - 変更管理ルールが曖昧

3. コミュニケーションリスク
   - 情報共有の頻度が低い
   - 誰が何を決めるかの責任範囲が不明確
   - エスカレーションルートが整備されていない

4. 推奨される改善アクション
   - ① WBS の再構築と見積もり精度の向上
   - ② 要件定義フェーズの再設計
   - ③ 週次のリスクレビュー会議の設定
   - ④ 変更管理プロセスの明文化

5. 期待される効果
   - スケジュール遵守率の向上
   - 要件変更による手戻りの削減
   - プロジェクト透明性の向上`,
};

self.addEventListener("install", (event) => {
  // すぐに有効化（デモ用途）
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function jsonResponse(body, init) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init && init.headers ? init.headers : {}),
    },
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 同一オリジンの疑似 API のみ扱う
  if (url.origin !== self.location.origin) return;
  if (url.pathname !== API_PATH) return;

  event.respondWith(handleRiskReport(event.request));
});

async function handleRiskReport(request) {
  // デモ用途：クライアント側が「支払い済み」をヘッダで渡す
  const paidHeader = request.headers.get("x-demo-paid");
  const isPaid = paidHeader === "true";

  if (!isPaid) {
    return jsonResponse(
      {
        error: "payment_required",
        message: "高精度診断レポートへのアクセスには支払いが必要です（疑似）。",
        price: { amount: 200, currency: "JPY" },
        retry: { method: "GET", path: API_PATH },
      },
      { status: 402, statusText: "Payment Required" }
    );
  }

  return jsonResponse(PAID_REPORT, { status: 200, statusText: "OK" });
}
