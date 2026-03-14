/*
  x402 (Payment Required) 疑似デモ
  - すべてフロントエンドのみ
  - 支払い状態は localStorage に保存
*/

const STORAGE_KEY = "x402demo.payment.paid.v1";
const API_URL = new URL("./api/risk-report", window.location.href).toString();
const STORAGE_PAYER_KEY = "x402demo.payment.payer.v1";
const STORAGE_TXHASH_KEY = "x402demo.payment.txhash.v1";

const SW_RELOAD_ONCE_KEY = "x402demo.sw.reloadedOnce.v1";

/** @type {"pending"|"ready"|"unavailable"} */
let swStatus = "pending";

const FREE_REPORT = `サトシ・ナカモト`;

const PAID_REPORT_FALLBACK = `サトシ・ナカモトとは、ビットコインとブロックチェーンを創造し、世界の金融史を根底から変えたにもかかわらず、その正体を完全に隠し通した“匿名の天才”です。
彼は2008〜2010年のわずか数年だけ姿を現し、革命を起こした後、静かに姿を消しました。

（Service Worker からの応答が取得できないため、フォールバック表示しています。）`;

function getPaid() {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function setPaid(value) {
  localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
}

function getPayer() {
  return localStorage.getItem(STORAGE_PAYER_KEY) || "";
}

function setPayer(value) {
  localStorage.setItem(STORAGE_PAYER_KEY, value || "");
}

function getTxHash() {
  return localStorage.getItem(STORAGE_TXHASH_KEY) || "";
}

function setTxHash(value) {
  localStorage.setItem(STORAGE_TXHASH_KEY, value || "");
}

function isLikelyAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isLikelyTxHash(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function normalizeStoredPaymentState() {
  const paid = getPaid();
  const payer = getPayer();
  const txHash = getTxHash();

  // 旧仕様の paid=true だけが残っている場合は詰むので、未払いへ戻す
  if (paid && (!payer || !txHash)) {
    setPaid(false);
    return;
  }

  // 形式がおかしい証跡は無効扱い
  if (payer && !isLikelyAddress(payer)) {
    setPayer("");
    setPaid(false);
  }
  if (txHash && !isLikelyTxHash(txHash)) {
    setTxHash("");
    setPaid(false);
  }
}

function resetAllState() {
  setPaid(false);
  setPayer("");
  setTxHash("");
  sessionStorage.removeItem(SW_RELOAD_ONCE_KEY);
  updatePaymentBadge();
  setText("freeResult", "");
  renderPaidArea({ mode: "empty" });
}

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node;
}

function setText(id, value) {
  el(id).textContent = value;
}

function updatePaymentBadge() {
  const paid = getPaid();
  const badge = el("paymentBadge");
  const tx = getTxHash();
  badge.textContent = paid
    ? `支払い状態：支払い済み${tx ? `（tx: ${tx.slice(0, 10)}…）` : ""}`
    : "支払い状態：未払い";
}

function updateSwBadge() {
  const badge = el("swBadge");
  if (swStatus === "ready") {
    badge.textContent = "Service Worker：有効";
    return;
  }
  if (swStatus === "unavailable") {
    badge.textContent = "Service Worker：無効";
    return;
  }
  badge.textContent = "Service Worker：準備中";
}

function setSwStatus(next) {
  swStatus = next;
  updateSwBadge();

  const runBtn = el("runDetailed");
  // Pages の初回インストール時など、SWが制御下に入るまで待ってから押せるようにする
  runBtn.disabled = swStatus === "pending";
}

function renderPaidArea(state) {
  const container = el("paidArea");
  container.innerHTML = "";

  if (state.mode === "empty") {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "ボタン押下後に表示されます。";
    container.appendChild(p);
    return;
  }

  if (state.mode === "payment_required") {
    const title = document.createElement("p");
    title.innerHTML = "<strong>HTTP 402 Payment Required</strong>";

    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent = "詳細をみるには、0.001 ETH の支払いが必要です。";

    const dl = document.createElement("dl");
    dl.className = "kv";

    const payment = state.payment;
    const priceLabel = payment
      ? `${payment.amountEth} ${payment.currency}（テストネット）`
      : "（取得中）";

    const payer = getPayer();
    const txHash = getTxHash();

    const rows = [
      ["チェーン", payment ? `Soneium Minato（chainId: ${payment.chainId}）` : "-"],
      ["価格", priceLabel],
      ["受取先", payment ? payment.to : "-"],
      ["保存先", "localStorage"],
      ["次の操作", "支払う → 再試行"],
    ];

    for (const [k, v] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      // 支払済なら支払アドレスとtxHashを強調表示
      if (k === "支払アドレス" && v && v !== "未接続") {
        dd.classList.add("empha");
      }
      if (k === "txHash" && v && v !== "未送金") {
        dd.classList.add("empha");
      }
      dl.appendChild(dt);
      dl.appendChild(dd);
    }

    // 折りたたみ表示にする（支払アドレス/txHashは展開情報として別表示）
    const detailsWrap = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "支払い情報（クリックで展開）";
    detailsWrap.appendChild(summary);
    detailsWrap.appendChild(dl);

    // 支払い済み（または送金済み）の場合は、payer/txHash を折りたたみ外で強調表示する
    if (payer || txHash) {
      const proofWrap = document.createElement("div");
      proofWrap.className = "payment-proof";

      if (payer) {
        const pEl = document.createElement("div");
        pEl.innerHTML = `<strong>支払アドレス:</strong> <span class=\"empha\">${payer}</span>`;
        proofWrap.appendChild(pEl);
      }
      if (txHash) {
        const tEl = document.createElement("div");
        tEl.innerHTML = `<strong>TxHash:</strong> <span class=\"empha\">${txHash}</span>`;
        proofWrap.appendChild(tEl);
      }
      // 表示を先に追加して目立たせる
      container.appendChild(proofWrap);
    }

    const row = document.createElement("div");
    row.className = "row";

    const payBtn = document.createElement("button");
    payBtn.type = "button";
    payBtn.className = "button";
    payBtn.textContent = getPaid() ? "支払い済み" : "支払う";
    payBtn.disabled = getPaid() || !payment;
    payBtn.addEventListener("click", async () => {
      if (!payment) return;
      payBtn.disabled = true;
      payBtn.textContent = "支払い処理中...";

      const result = await payOnChain(payment);
      if (!result.ok) {
        renderPaidArea({
          mode: "payment_required",
          payment,
          message: result.message,
        });
        return;
      }

      setPayer(result.payer);
      setTxHash(result.txHash);
      updatePaymentBadge();

      // 送金が通ったら、すぐ検証を再試行
      requestPaidReport();
    });

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "button";
    retryBtn.textContent = "再試行";
    retryBtn.disabled = !getTxHash() || !getPayer();
    retryBtn.addEventListener("click", () => {
      requestPaidReport();
    });

    row.appendChild(payBtn);
    row.appendChild(retryBtn);

    container.appendChild(title);
    container.appendChild(detail);
    // Receipt待ちメッセージは、payer/txHashがある場合は表示しない（代わりに支払い証跡を表示）
    const receiptWaiting = "Receiptがまだ取得できません。少し待って再試行してください。";
    if (state.message && state.message !== detail.textContent && !(state.message === receiptWaiting && (payer || txHash))) {
      const warn = document.createElement("p");
      warn.className = "muted";
      warn.textContent = state.message;
      container.appendChild(warn);
    }
    container.appendChild(detailsWrap);
    container.appendChild(row);
    return;
  }

  if (state.mode === "ok") {
    const title = document.createElement("p");
    title.innerHTML = "<strong>HTTP 200 OK</strong>";

    const pre = document.createElement("pre");
    pre.className = "pre";
    pre.textContent = state.report || "";

    container.appendChild(title);
    container.appendChild(pre);
    return;
  }

  if (state.mode === "unavailable") {
    const title = document.createElement("p");
    title.innerHTML = "<strong>取得失敗</strong>";

    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent =
      "このデモの Service Worker 版は、http(s) で配信されたページでのみ動作します（file:// 直開きでは動きません）。";

    const pre = document.createElement("pre");
    pre.className = "pre";
    pre.textContent = state.message || PAID_REPORT_FALLBACK;

    container.appendChild(title);
    container.appendChild(detail);
    container.appendChild(pre);
    return;
  }

  throw new Error(`Unknown state.mode: ${state.mode}`);
}

function hasEthers() {
  return typeof window !== "undefined" && typeof window.ethers !== "undefined";
}

async function payOnChain(payment) {
  if (!hasEthers()) {
    return { ok: false, message: "ethers.js の読み込みに失敗しました。" };
  }
  if (!window.ethereum) {
    return { ok: false, message: "ウォレットが見つかりません（MetaMask等が必要です）。" };
  }

  const { ethers } = window;
  const provider = new ethers.BrowserProvider(window.ethereum);

  // アカウント接続
  try {
    await provider.send("eth_requestAccounts", []);
  } catch {
    return { ok: false, message: "ウォレット接続が拒否されました。" };
  }

  // ネットワーク確認（chainId: 1946 / 0x79a）
  try {
    const currentChainId = await provider.send("eth_chainId", []);
    if ((currentChainId || "").toLowerCase() !== String(payment.chainIdHex).toLowerCase()) {
      // 可能ならスイッチを試みる（未追加なら手動案内）
      try {
        await provider.send("wallet_switchEthereumChain", [
          { chainId: payment.chainIdHex },
        ]);
      } catch (e) {
        const anyErr = /** @type {any} */ (e);
        const code = anyErr && (anyErr.code ?? anyErr.error?.code);
        const msg = anyErr && (anyErr.message ?? anyErr.error?.message);

        if (code === 4902 || String(msg || "").includes("4902")) {
          return {
            ok: false,
            message:
              "Soneium Minato がウォレットに未追加の可能性があります。ウォレットで chainId 1946（0x79a）を追加してから再実行してください。",
          };
        }
        return {
          ok: false,
          message:
            "ウォレットのネットワークが Soneium Minato ではありません。chainId 1946（0x79a）に切り替えてください。",
        };
      }
    }
  } catch {
    return { ok: false, message: "ネットワーク確認に失敗しました。" };
  }

  // 送金
  try {
    const signer = await provider.getSigner();
    const payer = await signer.getAddress();
    const tx = await signer.sendTransaction({
      to: payment.to,
      value: ethers.parseUnits(String(payment.amountEth), "ether"),
    });

    // ここで wait() すると体感が遅くなるので、まず txHash を保存して即リトライ。
    // ただし、receipt未確定の可能性があるので、SW側で「少し待って再試行」を返す。
    return { ok: true, payer, txHash: tx.hash };
  } catch {
    return { ok: false, message: "送金トランザクションが失敗またはキャンセルされました。" };
  }
}

async function requestPaidReport() {
  try {
    if (swStatus !== "ready") {
      renderPaidArea({
        mode: "unavailable",
        message:
          "Service Worker が有効になる前に実行されました。数秒待つか、ページを再読み込みしてからお試しください。",
      });
      return;
    }

    const payer = getPayer();
    const txHash = getTxHash();

    const resp = await fetch(API_URL, {
      method: "GET",
      cache: "no-store",
      headers: {
        "X-Demo-Payer": payer,
        "X-Demo-TxHash": txHash,
      },
    });

    if (resp.status === 402) {
      setPaid(false);
      updatePaymentBadge();
      const data = await resp.json().catch(() => null);
      const payment = data && data.payment ? data.payment : null;
      const message = data && typeof data.message === "string" ? data.message : "";
      renderPaidArea({ mode: "payment_required", payment, message });
      return;
    }

    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      const report = data && typeof data.report === "string" ? data.report : "";
      setPaid(true);
      updatePaymentBadge();
      renderPaidArea({ mode: "ok", report });
      return;
    }

    renderPaidArea({
      mode: "unavailable",
      message: `想定外の応答です（HTTP ${resp.status}）。`,
    });
  } catch (e) {
    renderPaidArea({
      mode: "unavailable",
      message: e instanceof Error ? e.message : "通信に失敗しました。",
    });
  }
}

function runDetailed() {
  // 回答はボタン押下で表示
  setText("freeResult", FREE_REPORT);
  // 詳細は支払い後のみ
  requestPaidReport();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    setSwStatus("unavailable");
    return;
  }

  setSwStatus("pending");

  try {
    await navigator.serviceWorker.register("./sw.js");

    // active になるまで待つ
    await navigator.serviceWorker.ready;

    // clients.claim() により同一ページでも制御下に入る想定。
    // それでも controller が付かない場合は、初回だけ自動リロードして安定化させる。
    if (navigator.serviceWorker.controller) {
      setSwStatus("ready");
      return;
    }

    await new Promise((resolve) => {
      let resolved = false;
      const onChange = () => {
        if (resolved) return;
        resolved = true;
        navigator.serviceWorker.removeEventListener("controllerchange", onChange);
        resolve();
      };

      navigator.serviceWorker.addEventListener("controllerchange", onChange);

      window.setTimeout(() => {
        if (resolved) return;
        resolved = true;
        navigator.serviceWorker.removeEventListener("controllerchange", onChange);
        resolve();
      }, 5000);
    });

    if (navigator.serviceWorker.controller) {
      setSwStatus("ready");
      return;
    }

    const alreadyReloaded = sessionStorage.getItem(SW_RELOAD_ONCE_KEY) === "true";
    if (!alreadyReloaded) {
      sessionStorage.setItem(SW_RELOAD_ONCE_KEY, "true");
      location.reload();
      return;
    }

    setSwStatus("unavailable");
  } catch {
    // 登録できない環境（file:// 等）でもデモは続行する
    setSwStatus("unavailable");
  }
}

function init() {
  normalizeStoredPaymentState();
  updatePaymentBadge();
  setSwStatus("pending");
  renderPaidArea({ mode: "empty" });

  registerServiceWorker();

  el("runDetailed").addEventListener("click", runDetailed);

  const resetBtn = document.getElementById("resetState");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetAllState);
  }

  // 入力中に古いエラーを消す
  el("inputText").addEventListener("input", () => {
    setText("inputError", "");
  });
}

init();
