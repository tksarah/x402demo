/*
  x402 (Payment Required) 疑似デモ
  - すべてフロントエンドのみ
  - 支払い状態は localStorage に保存
*/

const STORAGE_KEY = "x402demo.payment.paid.v1";
const API_URL = new URL("./api/risk-report", window.location.href).toString();
const STORAGE_PAYER_KEY = "x402demo.payment.payer.v1";
const STORAGE_TXHASH_KEY = "x402demo.payment.txhash.v1";
const STORAGE_PAYMENT_INFO_KEY = "x402demo.payment.info.v1";

const SW_RELOAD_ONCE_KEY = "x402demo.sw.reloadedOnce.v1";

/** @type {"pending"|"ready"|"unavailable"} */
let swStatus = "pending";
let verificationPollId = null;
let finalAnimationRunning = false;
let finalAnimationDone = false;

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

function setStoredPaymentInfo(obj) {
  try {
    if (!obj) return localStorage.removeItem(STORAGE_PAYMENT_INFO_KEY);
    localStorage.setItem(STORAGE_PAYMENT_INFO_KEY, JSON.stringify(obj));
  } catch (e) {}
}

function getStoredPaymentInfo() {
  try {
    const v = localStorage.getItem(STORAGE_PAYMENT_INFO_KEY);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
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

function resetAllStateAndHardReload() {
  // Clear demo state first
  resetAllState();

  // Small delay to ensure storage writes are flushed, then force a network reload
  setTimeout(() => {
    try {
      const url = new URL(location.href);
      // Add a cache-busting query param so the browser fetches fresh resources
      url.searchParams.set("_reload", Date.now());
      // Use replace so history isn't polluted
      location.replace(url.toString());
    } catch (e) {
      // Fallback to a plain reload if URL manipulation fails
      location.reload();
    }
  }, 50);
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

/* ------------------
   Progress UI logic
   ------------------ */
const X402_STEPS = [
  "リクエスト",
  "支払い要求",
  "<span class=\"two-line\">支払データ<br>署名付き作成</span>",
  "有効性検証",
  "支払い",
  "コンテンツ提供",
];

function initProgress() {
  const wrap = document.getElementById("x402-progress");
  if (!wrap) return;
  const nodes = wrap.querySelectorAll(".step");
  if (nodes.length === X402_STEPS.length) return;
  wrap.innerHTML = "";
  for (let i = 0; i < X402_STEPS.length; i++) {
    const s = document.createElement("div");
    s.className = "step";
    s.dataset.step = String(i);
    s.innerHTML = X402_STEPS[i];
    wrap.appendChild(s);
  }
}

function setProgress(stepIndex) {
  const wrap = document.getElementById("x402-progress");
  if (!wrap) return;
  const steps = Array.from(wrap.querySelectorAll(".step"));
  steps.forEach((el, idx) => {
    el.classList.toggle("active", idx === stepIndex);
    el.classList.toggle("completed", idx < stepIndex);
  });
  // Update explanatory text corresponding to current step
  try {
    renderProgressExplanation(stepIndex);
  } catch (e) {
    // no-op if explanation element is missing
  }
}

/**
 * Render human-readable explanation for the given progress step.
 * Currently implements the initial requested message for step 1.
 */
function renderProgressExplanation(stepIndex) {
  const elExp = document.getElementById("x402-explanation");
  if (!elExp) return;
  // 初回アクセス時のプレースホルダ表示
  if (stepIndex === 0) {
    elExp.innerHTML = '<p class="muted small">（ここに進捗の説明が入ります。）</p>';
    return;
  }
  // Build a cumulative ordered list of explanations for each stage
  const items = [];

  // 1
  items.push('クライアントはコンテンツ提供サーバーへコンテンツ提供の要求');

  // 2-4 (支払データ署名付き作成)
  if (stepIndex >= 2) {
    items.push('コンテンツ提供サーバーは支払い条件（金額等）をクライアントへ提示');
    items.push('クライアントは“支払データ、署名付き”の作成（この時点では支払いは完了していない）');
    items.push('クライアントは3を付けてコンテンツ提供サーバーへ再要求');
  }

  // 5-7 (有効性検証)
  if (stepIndex >= 3) {
    items.push('コンテンツ提供サーバーは受け取った3の検証依頼をファシリテータへ行う');
    items.push('ファシリテーターは検証の結果をコンテンツ提供サーバーへ返答');
    items.push('コンテンツ提供サーバーは検証結果が“有効”の時、コンテンツの提供準備を開始し、ファシリテーターに決済処理を依頼');
  }

  // 8-9 (支払い)
  if (stepIndex >= 4) {
    items.push('ファシリテータはブロックチェーンに決済の取引を送信');
    items.push('ブロックチェーンは取引を確定し、ファシリテーターに応答');
  }

  // 10-11 (コンテンツ提供)
  if (stepIndex >= 5) {
    items.push('ファシリテーターは決済の完了をコンテンツ提供サーバーへ通知');
    items.push('コンテンツ提供サーバーは10の通知を受けて、クライアントにコンテンツを提供');
  }

  // Render as an ordered list, keeping output visible for later steps
  const html = ['<ol class="x402-steps">'];
  for (const it of items) {
    if (typeof it === 'string') {
      html.push(`<li>${it}</li>`);
    } else {
      html.push(`<li>${it.text}<div class="sub">${it.sub}</div></li>`);
    }
  }
  html.push('</ol>');
  elExp.innerHTML = html.join('');
  // end renderProgressExplanation
}

function animateFinalSteps() {
  return new Promise((resolve) => {
    if (finalAnimationDone) {
      // already finished previously — ensure final progress is set
      setProgress(5);
      return resolve();
    }
    if (finalAnimationRunning) return resolve();
    finalAnimationRunning = true;
    const step4 = document.querySelector('.x402-progress .step[data-step="4"]');
    const step5 = document.querySelector('.x402-progress .step[data-step="5"]');
    if (!step4 || !step5) return resolve();

    // ensure initial state
    step4.classList.remove('anim-highlight');
    step5.classList.remove('anim-highlight');

    // highlight step4 for 1s, then step5 for 1s, then mark completed and set final progress
    step4.classList.add('anim-highlight');
    // ensure explanation updates when step4 (支払い) is highlighted
    try { renderProgressExplanation(4); } catch (e) {}
    setTimeout(() => {
      step4.classList.remove('anim-highlight');
      step4.classList.add('completed');

      step5.classList.add('anim-highlight');
      // update explanation when step5 (コンテンツ提供) is highlighted
      try { renderProgressExplanation(5); } catch (e) {}
      setTimeout(() => {
        step5.classList.remove('anim-highlight');
        step5.classList.add('completed');
        setProgress(5);
        finalAnimationRunning = false;
        finalAnimationDone = true;
        resolve();
      }, 1000);
    }, 1000);
  });
}

function startVerificationPoll(intervalMs = 3000) {
  if (verificationPollId) return;
  // immediately try once, then schedule
  (async () => {
    await requestPaidReport().catch(() => {});
  })();
  verificationPollId = setInterval(async () => {
    try {
      if (getPaid() || !getTxHash()) {
        stopVerificationPoll();
        return;
      }
      await requestPaidReport();
    } catch (e) {
      // ignore transient errors
    }
  }, intervalMs);
}

function stopVerificationPoll() {
  if (!verificationPollId) return;
  clearInterval(verificationPollId);
  verificationPollId = null;
}

function syncProgressWithState() {
  if (getPaid()) {
    setProgress(5);
    return;
  }
  if (getTxHash()) {
    setProgress(3);
    return;
  }
  setProgress(0);
}

function updateSwBadge() {
  const badge = el("swBadge");
  // reset classes
  badge.classList.remove("sw-ready", "sw-unavailable");
  if (swStatus === "ready") {
    badge.textContent = "Service Worker：有効";
    badge.classList.add("sw-ready");
    return;
  }
  if (swStatus === "unavailable") {
    badge.textContent = "Service Worker：無効";
    badge.classList.add("sw-unavailable");
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
    // 空状態では何も表示しない（以前の案内文を削除）
    return;
  }

  if (state.mode === "payment_required") {
    // reflect that server asked for payment
    setProgress(1);
    const title = document.createElement("p");
    title.innerHTML = "<strong>HTTP 402 Payment Required</strong>";

      // note: the explanatory sentence about 0.001 ETH was removed per UI request

    const dl = document.createElement("dl");
    dl.className = "kv";

    const payment = state.payment;
    const priceLabel = payment
      ? `${payment.amountEth} ${payment.currency}（テストネット）`
      : "（取得中）";

    const payer = getPayer();
    const txHash = getTxHash();

    // persist received payment info so we can show it later (final screen)
    if (payment) setStoredPaymentInfo(payment);

    const rows = [
      ["チェーン", payment ? `Soneium Minato（chainId: ${payment.chainId}）` : "-"],
      ["価格", priceLabel],
      ["受取先", payment ? payment.to : "-"],
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
    // 支払い情報領域の上マージンを調整しやすくするためのクラス
    detailsWrap.className = "paid-details";
    const summary = document.createElement("summary");
    summary.textContent = "支払先情報";
    detailsWrap.appendChild(summary);
    detailsWrap.appendChild(dl);

    // detailsWrap will be used as the collapsible (folded) payment info

    // 支払い済み（または送金済み）の場合は、payer/txHash を折りたたみ外で強調表示する
    if (payer || txHash) {
      const proofWrap = document.createElement("div");
      proofWrap.className = "payment-proof";

      if (payer) {
        const pEl = document.createElement("div");
        pEl.className = "proof-item";
        pEl.innerHTML = `<strong>支払アドレス：</strong><br><span class="empha proof-value">${payer}</span>`;
        proofWrap.appendChild(pEl);
      }
      if (txHash) {
        const tEl = document.createElement("div");
        tEl.className = "proof-item";
        tEl.innerHTML = `<strong>TxHash：</strong><br><span class="empha proof-value">${txHash}</span>`;
        proofWrap.appendChild(tEl);
      }
      // 表示を先に追加して目立たせる
      container.appendChild(proofWrap);
    }

    const row = document.createElement("div");
    row.className = "row";

    // 支払い済みフラグが true、または txHash が既にある場合は「支払う」ボタンを表示しない
    let payBtn = null;
    if (!getPaid() && !getTxHash()) {
      payBtn = document.createElement("button");
      payBtn.type = "button";
      payBtn.className = "button";
      payBtn.textContent = "コンテンツの要求（支払要求）";
      payBtn.disabled = !payment;
      payBtn.addEventListener("click", () => {
        if (!payment) return;
        openPaymentModal(payment, async () => {
          // user confirmed via "暗号資産" を選択した後に実際のウォレット処理を行う
          try {
            payBtn.disabled = true;
            payBtn.textContent = "コンテンツ要求中...";
            setProgress(2);

            const result = await payOnChain(payment);
            if (!result.ok) {
              renderPaidArea({ mode: "payment_required", payment, message: result.message });
              closePaymentModal();
              return;
            }

            setPayer(result.payer);
            setTxHash(result.txHash);
            updatePaymentBadge();

            setProgress(3);
            requestPaidReport();
            startVerificationPoll(3000);
            closePaymentModal();
          } catch (e) {
            renderPaidArea({ mode: "payment_required", payment, message: e instanceof Error ? e.message : String(e) });
            closePaymentModal();
          }
        });
      });
    }

    if (payBtn) row.appendChild(payBtn);

    // txHash がある場合は、支払いプロンプトや "Txが見つかりません" を表示せず、
    // 代わりに案内メッセージを出す
    if (txHash) {
      // ボタン群を先に追加し、支払先情報はカード内で折りたたみ表示
      container.appendChild(row);
      container.appendChild(detailsWrap);
      // tx がある段階は検証中
      setProgress(3);
      return;
    }

    // txHash がない場合は通常の支払いプロンプトを表示
    container.appendChild(title);

    // Receipt待ちメッセージは、payer/txHashがある場合は表示しない（代わりに支払い証跡を表示）
    const receiptWaiting = "Receiptがまだ取得できません。しばらくお待ちください。";
    if (state.message && !(state.message === receiptWaiting && (payer || txHash))) {
      const warn = document.createElement("p");
      warn.className = "muted";
      warn.textContent = state.message;
      container.appendChild(warn);
    }

    // ボタン群を先に追加し、支払先情報はカード内で折りたたみ表示
    container.appendChild(row);
    container.appendChild(detailsWrap);
    return;
  }

  if (state.mode === "ok") {
    // success -> final step
    setProgress(5);
    const pre = document.createElement("pre");
    pre.className = "pre";
    pre.textContent = state.report || "";

    container.appendChild(pre);
    // Ensure payment details / proof remain visible on final screen
    const storedPayment = getStoredPaymentInfo();
    const payer = getPayer();
    const txHash = getTxHash();

    if (payer || txHash) {
      const proofWrap = document.createElement("div");
      proofWrap.className = "payment-proof";
      if (payer) {
        const pEl = document.createElement("div");
        pEl.className = "proof-item";
        pEl.innerHTML = `<strong>支払アドレス：</strong><br><span class="empha proof-value">${payer}</span>`;
        proofWrap.appendChild(pEl);
      }
      if (txHash) {
        const tEl = document.createElement("div");
        tEl.className = "proof-item";
        tEl.innerHTML = `<strong>TxHash：</strong><br><span class="empha proof-value">${txHash}</span>`;
        proofWrap.appendChild(tEl);
      }
      container.appendChild(proofWrap);
    }

    if (storedPayment) {
      const dl = document.createElement("dl");
      dl.className = "kv";
      const rows = [
        ["チェーン", storedPayment.chainId ? `Soneium Minato（chainId: ${storedPayment.chainId}）` : "-"],
        ["価格", storedPayment.amountEth ? `${storedPayment.amountEth} ${storedPayment.currency}（テストネット）` : "-"],
        ["受取先", storedPayment.to || "-"],
      ];
      for (const [k, v] of rows) {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
      const detailsWrap = document.createElement("details");
      detailsWrap.className = "paid-details";
      const summary = document.createElement("summary");
      summary.textContent = "支払先情報";
      detailsWrap.appendChild(summary);
      detailsWrap.appendChild(dl);
      container.appendChild(detailsWrap);
    }

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

// --- Payment selection modal helpers ---
function openPaymentModal(payment, onConfirm) {
  const overlay = document.getElementById("payment-modal-overlay");
  const modal = document.getElementById("payment-modal");
  if (!overlay || !modal) return;

  // show
  overlay.hidden = false;
  modal.hidden = false;
  overlay.classList.add("open");
  modal.classList.add("open");

  // wire buttons
  const btnCrypto = document.getElementById("pm-crypto");
  const btnClose = document.getElementById("pm-close");

  function handleCrypto() {
    try {
      if (typeof onConfirm === "function") onConfirm();
    } finally {
      // don't rely on caller to close modal
      closePaymentModal();
    }
  }

  function handleClose() {
    closePaymentModal();
  }

  function handleOverlayClick(e) {
    if (e.target === overlay) closePaymentModal();
  }

  function handleKey(e) {
    if (e.key === "Escape") closePaymentModal();
  }

  // attach
  btnCrypto && btnCrypto.addEventListener("click", handleCrypto);
  btnClose && btnClose.addEventListener("click", handleClose);
  overlay.addEventListener("click", handleOverlayClick);
  document.addEventListener("keydown", handleKey);

  // store handlers for cleanup
  modal._pm_handlers = { handleCrypto, handleClose, handleOverlayClick, handleKey };

  // focus
  setTimeout(() => {
    const focusEl = document.getElementById("pm-crypto");
    if (focusEl) focusEl.focus();
  }, 50);
}

function closePaymentModal() {
  const overlay = document.getElementById("payment-modal-overlay");
  const modal = document.getElementById("payment-modal");
  if (!overlay || !modal) return;

  const handlers = modal._pm_handlers || {};
  const btnCrypto = document.getElementById("pm-crypto");
  const btnClose = document.getElementById("pm-close");

  if (btnCrypto && handlers.handleCrypto) btnCrypto.removeEventListener("click", handlers.handleCrypto);
  if (btnClose && handlers.handleClose) btnClose.removeEventListener("click", handlers.handleClose);
  if (handlers.handleOverlayClick) overlay.removeEventListener("click", handlers.handleOverlayClick);
  if (handlers.handleKey) document.removeEventListener("keydown", handlers.handleKey);

  overlay.classList.remove("open");
  modal.classList.remove("open");
  overlay.hidden = true;
  modal.hidden = true;
  modal._pm_handlers = null;
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
    // ただし、receipt未確定の可能性があるので、SW側で「少し待って『詳細を見る' を返す。
    return { ok: true, payer, txHash: tx.hash };
  } catch {
    return { ok: false, message: "送金トランザクションが失敗またはキャンセルされました。" };
  }
}

async function requestPaidReport() {
  try {
    if (swStatus !== "ready") {
      // still in request phase
      setProgress(0);
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
      setProgress(1);
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

      // stop any ongoing polling now that payment is confirmed
      stopVerificationPoll();

      // mark step4 as paid (visual emphasis) but do NOT change the label text here
      const step4 = document.querySelector('.x402-progress .step[data-step="4"]');
      if (step4) {
        step4.classList.add('paid');
      }

      // animate final two steps (step 4 -> step 5) sequentially, 1s each
      await animateFinalSteps();

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
  // If already paid, show paid-animation immediately (change label to 支払い済み)
  if (getPaid()) {
    const step4 = document.querySelector('.x402-progress .step[data-step="4"]');
    if (step4) {
      step4.innerHTML = '支払い済み';
      step4.classList.add('paid');
    }
    // animate final two steps immediately; still request report in background
    animateFinalSteps().catch(() => {});
    // fetch the paid report (don't await so animation isn't blocked)
    requestPaidReport();
    return;
  }

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

  // initialize progress UI and sync with stored payment state
  initProgress();
  syncProgressWithState();

  registerServiceWorker();

  el("runDetailed").addEventListener("click", runDetailed);

  const resetBtn = document.getElementById("resetState");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetAllStateAndHardReload);
  }

  // 入力中に古いエラーを消す（入力要素が存在する場合のみ）
  const maybeInput = document.getElementById("inputText");
  if (maybeInput) {
    maybeInput.addEventListener("input", () => {
      setText("inputError", "");
    });
  }

  // If there's an outstanding txHash on load, start polling to detect verification
  if (getTxHash() && !getPaid()) {
    startVerificationPoll(3000);
  }
}

init();

// Wire up aria-expanded for the x402 diagram <details>
(function wireDiagramDetails(){
  try{
    const det = document.getElementById('x402-diagram');
    if(!det) return;
    det.setAttribute('aria-expanded', det.open ? 'true' : 'false');
    det.addEventListener('toggle', function(){
      det.setAttribute('aria-expanded', det.open ? 'true' : 'false');
    });
  }catch(e){}
})();
