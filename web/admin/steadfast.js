(() => {
  const api = async (path, options = {}) => { const token = sessionStorage.getItem('rinova-admin-token') || ''; const response = await fetch(`${window.RINOVA_API_BASE || '/api'}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Request failed'); return data; };
  const fill = (id, value) => { const node = document.getElementById(id); if (node) node.value = value || ''; };
  async function loadConfig() { try { const data = await api('/admin/steadfast/config'); fill('steadfast-base-url', data.baseUrl); fill('steadfast-api-key', data.apiKey); fill('steadfast-secret-key', data.secretKey); fill('steadfast-webhook-token', data.webhookToken); fill('steadfast-webhook-url', data.webhookUrl); const status = document.getElementById('steadfast-status'); if (status) { status.textContent = data.configured ? 'Configured' : 'Needs secrets'; status.className = `privacy-chip ${data.configured ? 'integration-ready' : 'integration-missing'}`; } } catch (error) { const message = document.getElementById('steadfast-message'); if (message) message.textContent = error.message; } }
  async function testConnection() { const button = document.getElementById('steadfast-test'); const message = document.getElementById('steadfast-message'); if (!button || !message) return; button.disabled = true; message.textContent = 'Testing credentials…'; try { const data = await api('/admin/steadfast/test', { method: 'POST', body: '{}' }); message.textContent = data.balance === null ? data.message : `${data.message} Balance: ${data.balance}`; } catch (error) { message.textContent = error.message; } finally { button.disabled = false; } }
  async function book(orderCode, button) { if (!window.confirm(`Send ${orderCode} to SteadFast now? This creates a live courier shipment.`)) return; button.disabled = true; button.textContent = 'Sending…'; try { const data = await api(`/admin/orders/${encodeURIComponent(orderCode)}/steadfast/book`, { method: 'POST', body: '{}' }); button.textContent = data.courier?.trackingCode ? `Sent · ${data.courier.trackingCode}` : 'Sent to SteadFast'; button.classList.add('is-complete'); } catch (error) { button.disabled = false; button.textContent = 'Send to SteadFast'; window.alert(error.message); } }
  function enhanceOrders() { document.querySelectorAll('#orders-table tr').forEach((row) => { if (row.querySelector('[data-steadfast-book]')) return; const print = row.querySelector('[data-print-order]'); if (!print) return; const orderCode = print.dataset.printOrder; const cell = print.closest('.order-row-actions') || print.closest('td'); const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-action steadfast-book-button'; button.dataset.steadfastBook = orderCode; button.textContent = 'Send to SteadFast'; button.addEventListener('click', () => book(orderCode, button)); cell.appendChild(button); }); }
    // The admin token only exists after sign-in; calling the config endpoint before that
  // just parks an "Unauthorized admin request." message on the Settings page.
  function loadConfigWhenSignedIn() {
    if (sessionStorage.getItem('rinova-admin-token')) return loadConfig();
    const shell = document.getElementById('app-shell');
    if (!shell) return;
    const observer = new MutationObserver(() => {
      if (shell.classList.contains('hidden') || !sessionStorage.getItem('rinova-admin-token')) return;
      observer.disconnect();
      loadConfig();
    });
    observer.observe(shell, { attributes: true, attributeFilter: ['class'] });
  }
  document.addEventListener('DOMContentLoaded', () => { document.getElementById('steadfast-test')?.addEventListener('click', testConnection); loadConfigWhenSignedIn(); const table = document.getElementById('orders-table'); if (table) new MutationObserver(enhanceOrders).observe(table, { childList: true }); });
})();
