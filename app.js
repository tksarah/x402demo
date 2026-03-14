/*
  x402 (Payment Required) 疑似デモ
  - すべてフロントエンドのみ
  - 支払い状態は localStorage に保存
*/

const STORAGE_KEY = "x402demo.payment.paid.v1";
const API_URL = new URL("./api/risk-report", window.location.href).toString();

const SW_RELOAD_ONCE_KEY = "x402demo.sw.reloadedOnce.v1";

/** @type {"pending"|"ready"|"unavailable"} */
let swStatus = "pending";

const FREE_REPORT = `【簡易診断】
プロジェクトにリスクがあります。改善が必要です。`;

const PAID_REPORT_FALLBACK = `【高精度プロジェクトリスク診断レポート】

（Service Worker からの応答が取得できないため、フォールバック表示しています。）`;

function getPaid() {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function setPaid(value) {
  localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
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
  badge.textContent = paid ? "支払い状態：支払い済み" : "支払い状態：未払い";
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
    detail.textContent = "高精度診断レポートへのアクセスには支払いが必要です（疑似）。";

    const dl = document.createElement("dl");
    dl.className = "kv";

    const rows = [
      ["価格", "¥200（デモ）"],
      ["保存先", "localStorage"],
      ["次の操作", "支払う → 再試行"],
    ];

    for (const [k, v] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }

    const row = document.createElement("div");
    row.className = "row";

    const payBtn = document.createElement("button");
    payBtn.type = "button";
    payBtn.className = "button";
    payBtn.textContent = getPaid() ? "支払い済み" : "支払う";
    payBtn.disabled = getPaid();
    payBtn.addEventListener("click", () => {
      setPaid(true);
      updatePaymentBadge();
      renderPaidArea({ mode: "payment_required" });
    });

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "button";
    retryBtn.textContent = "再試行";
    retryBtn.disabled = !getPaid();
    retryBtn.addEventListener("click", () => {
      requestPaidReport();
    });

    row.appendChild(payBtn);
    row.appendChild(retryBtn);

    container.appendChild(title);
    container.appendChild(detail);
    container.appendChild(dl);
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

    const resp = await fetch(API_URL, {
      method: "GET",
      cache: "no-store",
      headers: {
        "X-Demo-Paid": getPaid() ? "true" : "false",
      },
    });

    if (resp.status === 402) {
      renderPaidArea({ mode: "payment_required" });
      return;
    }

    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      const report = data && typeof data.report === "string" ? data.report : "";
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

function validateInput(text) {
  if (!text || text.trim().length === 0) {
    return "文章を入力してください。";
  }
  return "";
}

function runDetailed() {
  const text = el("inputText").value;
  const error = validateInput(text);
  setText("inputError", error);
  if (error) return;

  // 無料版の簡易診断は、詳細診断を試みたタイミングで表示する
  setText("freeResult", FREE_REPORT);

  // 有料版は、Service Worker の疑似 API を叩いて 402 / 200 を取得
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
  updatePaymentBadge();
  setSwStatus("pending");
  renderPaidArea({ mode: "empty" });

  registerServiceWorker();

  el("runDetailed").addEventListener("click", runDetailed);

  // 入力中に古いエラーを消す
  el("inputText").addEventListener("input", () => {
    setText("inputError", "");
  });
}

init();
