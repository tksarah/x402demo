// mock-wallet.js
// ブラウザのみで動作するモック支払い注入スクリプト
// 有効化: ページURLに ?mock=true が含まれるとオン
(function(){
  try {
    const params = new URL(location.href).searchParams;
    if (params.get('mock') !== 'true') return;
  } catch (e) {
    return;
  }

  console.info('[mock-wallet] モックウォレットモードを有効化しました');
  window.__MOCK_WALLET = true;

  function makeRandomHex(len){
    let s = '';
    for(let i=0;i<len;i++) s += Math.floor(Math.random()*16).toString(16);
    return s;
  }

  async function mockPayOnChain(payment){
    // Create overlay dialog
    const overlay = document.createElement('div');
    overlay.style = 'position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:99999;';

    const box = document.createElement('div');
    box.style = 'background:#fff;color:#111;padding:18px;border-radius:10px;max-width:420px;width:92%;box-shadow:0 8px 24px rgba(0,0,0,0.2);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;';

    const title = document.createElement('h3');
    title.textContent = 'モック支払い（デモ）';
    title.style.marginTop = '0';

    const info = document.createElement('div');
    info.innerHTML = `<p style="margin:6px 0">受取先: <strong>${payment && payment.to ? payment.to : '-'}</strong></p><p style="margin:6px 0">金額: <strong>${payment && payment.amountEth ? payment.amountEth + ' ' + (payment.currency||'ETH') : '-'}</strong></p>`;

    const note = document.createElement('p');
    note.style = 'font-size:12px;color:#666;margin:8px 0 12px 0';
    note.textContent = '※実際の送金は行われません。承認すると擬似トランザクションが生成され、ワークフローは成功扱いになります。';

    const btnRow = document.createElement('div');
    btnRow.style = 'text-align:right;margin-top:12px';

    const btnReject = document.createElement('button');
    btnReject.textContent = '拒否する';
    btnReject.style = 'margin-right:8px;padding:8px 12px;background:#fff;border:1px solid #ccc;border-radius:6px;cursor:pointer';

    const btnApprove = document.createElement('button');
    btnApprove.textContent = '承認（成功）';
    btnApprove.style = 'padding:8px 12px;background:#0066cc;color:#fff;border:none;border-radius:6px;cursor:pointer';

    const extraFail = document.createElement('button');
    extraFail.textContent = '承認（失敗）';
    extraFail.style = 'margin-left:8px;padding:8px 12px;background:#cc3300;color:#fff;border:none;border-radius:6px;cursor:pointer';

    btnRow.appendChild(btnReject);
    btnRow.appendChild(btnApprove);
    btnRow.appendChild(extraFail);

    box.appendChild(title);
    box.appendChild(info);
    box.appendChild(note);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    return await new Promise((resolve) => {
      function cleanup(){
        try{ document.body.removeChild(overlay); }catch(e){}
      }

      btnApprove.addEventListener('click', ()=>{
        cleanup();
        const payer = '0x' + makeRandomHex(40).slice(0,40);
        const txHash = '0x' + makeRandomHex(64);

        // アプリ側の状態更新関数があれば呼び出して検証フェーズで止まらないようにする
        try {
          if (typeof window.setPayer === 'function') window.setPayer(payer);
          if (typeof window.setTxHash === 'function') window.setTxHash(txHash);
          if (typeof window.updatePaymentBadge === 'function') window.updatePaymentBadge();
          if (typeof window.setPaid === 'function') window.setPaid(true);
          if (typeof window.animateFinalSteps === 'function') {
            // 非同期アニメーションを走らせ、失敗は無視
            window.animateFinalSteps().catch(()=>{});
          }
          if (typeof window.renderPaidArea === 'function') {
            window.renderPaidArea({ mode: 'ok', report: '(モック) 支払いをシミュレーションしました。' });
          }
        } catch (e) {}

        resolve({ ok: true, payer, txHash });
      });

      btnReject.addEventListener('click', ()=>{
        cleanup();
        resolve({ ok: false, message: 'ユーザーがモック支払いを拒否しました。' });
      });

      extraFail.addEventListener('click', ()=>{
        cleanup();
        resolve({ ok: false, message: 'モック：決済失敗（シミュレーション）' });
      });
    });
  }

  // 保護のため、既定でオリジナルを退避
  try{
    if (typeof window.payOnChain === 'function') {
      window.__orig_payOnChain = window.payOnChain;
    }
  }catch(e){}

  // 注入: グローバルの payOnChain を上書き
  window.payOnChain = async function(payment){
    try{
      return await mockPayOnChain(payment);
    }catch(e){
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  };

  // モックモードでは検証リクエストやポーリングを無効化／成功化して
  // 承認後にワークフローが元に戻らないようにする
  try {
    if (typeof window.requestPaidReport === 'function') {
      window.__orig_requestPaidReport = window.requestPaidReport;
    }
    window.requestPaidReport = async function() {
      try {
        // 既に payer/txHash が設定されている場合のみ強制的に成功へ遷移する
        let hasProof = false;
        try {
          if (typeof window.getTxHash === 'function' && window.getTxHash()) hasProof = true;
          if (!hasProof && typeof window.getPayer === 'function' && window.getPayer()) hasProof = true;
        } catch (e) {
          // ignore
        }

        if (!hasProof) {
          // 元の振る舞いがあれば委譲して、モックでは未払い（402）相当にする
          if (typeof window.__orig_requestPaidReport === 'function') return window.__orig_requestPaidReport();
          return Promise.resolve();
        }

        if (typeof window.setPaid === 'function') window.setPaid(true);
        if (typeof window.updatePaymentBadge === 'function') window.updatePaymentBadge();
        if (typeof window.renderPaidArea === 'function') {
          window.renderPaidArea({ mode: 'ok', report: '(モック) 支払いをシミュレーションしました。' });
        }
      } catch (e) {}
      return Promise.resolve();
    };

    if (typeof window.startVerificationPoll === 'function') {
      window.__orig_startVerificationPoll = window.startVerificationPoll;
    }
    window.startVerificationPoll = function(){ /* noop in mock mode */ };
  } catch (e) {}

})();
