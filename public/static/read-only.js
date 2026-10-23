(() => {
  function applyReadOnly() {
    if (document.body.dataset.readOnly !== 'true') return;
    const selector = [
      '#run-prolevel-batch-btn', '#run-evaluation-btn', '#run-youtube-evaluation-btn',
      '#run-x-evaluation-btn', '#run-x-evaluation-auto-btn', '#re-eval-prolevel-btn',
      '#re-eval-youtube-btn', '#re-eval-x-btn', 'a[href="/analytics-data"]',
    ].join(',');
    document.querySelectorAll(selector).forEach(control => {
      control.hidden = true;
      if ('disabled' in control) control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
    });
    document.addEventListener('click', event => {
      if (event.target.closest?.(selector)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    const notice = document.createElement('p');
    notice.textContent = '閲覧専用です。保存済みの結果を確認できます。新しい評価やデータ更新は管理者へ依頼してください。';
    notice.className = 'bg-blue-50 text-blue-900 p-3 text-sm';
    document.body.prepend(notice);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyReadOnly);
  else applyReadOnly();
})();
