/*
  Service Worker: 疑似 API を実装
  - /api/risk-report へのリクエストを捕捉し、402 / 200 を返す
  - 支払い状態はデモのため「リクエストヘッダ」で受け取る
*/

const API_PATH = new URL("./api/risk-report", self.registration.scope).pathname;

// === Chain / Payment config (demo) ===
const CHAIN_ID_DEC = 1946;
const CHAIN_ID_HEX = "0x79a";
const RPC_URL = "https://rpc.minato.soneium.org";
const PAYMENT_TO = "0xbe587b30a5514c7866b3c0efe08e93b7c3d5be14";
const PRICE_WEI_DEC = "1000000000000000"; // 0.001 ETH
const PRICE_WEI_HEX = "0x38d7ea4c68000"; // 0.001 ETH

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
  // デモ用途：クライアントが支払い証跡（txHash + payer）をヘッダで渡す
  const txHash = (request.headers.get("x-demo-txhash") || "").trim();
  const payer = (request.headers.get("x-demo-payer") || "").trim().toLowerCase();

  if (!txHash || !payer) {
    return paymentRequiredResponse();
  }

  const verdict = await verifyPayment({ txHash, payer });
  if (!verdict.ok) {
    return jsonResponse(
      {
        error: "payment_required",
        message: verdict.message,
        payment: buildPaymentRequest(),
      },
      { status: 402, statusText: "Payment Required" }
    );
  }

  return jsonResponse(
    {
      const PAID_REPORT = {
        report: `サトシ・ナカモトとは、ビットコインとブロックチェーンを創造し、世界の金融史を根底から変えたにもかかわらず、その正体を完全に隠し通した“匿名の天才”です。
        "高精度診断レポートへのアクセスには支払いが必要です（Soneium Minato テストネット / 0.001 ETH）。",
      };
      payment: buildPaymentRequest(),
      retry: { method: "GET", path: API_PATH },
    },
    { status: 402, statusText: "Payment Required" }
  );
}

async function rpcCall(method, params) {
  const resp = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!resp.ok) {
    throw new Error(`RPC HTTP ${resp.status}`);
  }

  const data = await resp.json();
  if (data.error) {
    throw new Error(data.error.message || "RPC error");
  }
  return data.result;
}

function normalizeHexAddress(addr) {
  return (addr || "").toLowerCase();
}

function isHexTxHash(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

async function verifyPayment({ txHash, payer }) {
  if (!isHexTxHash(txHash)) {
    return { ok: false, message: "txHash の形式が不正です。" };
  }
  if (!/^0x[0-9a-f]{40}$/.test(payer)) {
    return { ok: false, message: "payer アドレスの形式が不正です。" };
  }

  try {
    const [tx, receipt] = await Promise.all([
      rpcCall("eth_getTransactionByHash", [txHash]),
      rpcCall("eth_getTransactionReceipt", [txHash]),
    ]);

    if (!tx) {
      return { ok: false, message: "Txが見つかりません（まだ伝播していない可能性があります）。" };
    }
    if (!receipt) {
      return { ok: false, message: "Receiptがまだ取得できません。少し待って再試行してください。" };
    }
    if (receipt.status !== "0x1") {
      return { ok: false, message: "Txが成功していません（status != 0x1）。" };
    }

    const to = normalizeHexAddress(tx.to);
    const from = normalizeHexAddress(tx.from);
    const expectedTo = normalizeHexAddress(PAYMENT_TO);
    const expectedFrom = normalizeHexAddress(payer);

    if (to !== expectedTo) {
      return { ok: false, message: "送金先アドレスが一致しません。" };
    }
    if (from !== expectedFrom) {
      return { ok: false, message: "送金元アドレスが一致しません。" };
    }
    if ((tx.value || "").toLowerCase() !== PRICE_WEI_HEX) {
      return { ok: false, message: "送金額が一致しません（0.001 ETH が必要です）。" };
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message:
        "RPC検証に失敗しました。RPCのCORS許可や到達性、またはネットワーク設定を確認してください。",
    };
  }
}
