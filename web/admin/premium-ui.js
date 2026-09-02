(() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  const apiBase = () => window.RINOVA_API_BASE || '/api';
  const auth = () => ({ Authorization: `Bearer ${sessionStorage.getItem('rinova-admin-token') || ''}` });
  const api = async (path, options = {}) => { const response = await fetch(`${apiBase()}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...auth(), ...(options.headers || {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Request failed'); return data; };
  const statusBadge = (status) => `<span class="tracking-status tracking-${esc(status || 'error')}">${status === 'healthy' ? 'Verified / Healthy' : status === 'ready' ? 'Ready' : status === 'warning' ? 'Needs setup' : 'Error'}</span>`;
  // ---------------------------------------------------------------------------
  // Campaign Studio — ad landing pages the owner can build, preview and publish
  // without touching the storefront navigation.
  // ---------------------------------------------------------------------------
  const campaignState = { editingId: null, products: [], selected: new Set(), search: '' };

  const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

  function campaignFormMarkup() {
    return `<form id="campaign-form" class="panel campaign-form">
      <div class="panel-heading"><div><p class="eyebrow" id="campaign-form-eyebrow">NEW CAMPAIGN</p><h3 id="campaign-form-title">Ad landing page</h3><p class="muted">Give the campaign a name — the page link is created for you. Nothing is public until you set it Active.</p></div><button id="campaign-cancel" class="icon-action" type="button" hidden>Cancel edit</button></div>

      <label>Campaign name · ক্যাম্পেইনের নাম<input name="title" required placeholder="Winter Glow Edit" autocomplete="off" /></label>

      <div class="campaign-url-field">
        <span class="setting-label">Page link · পেজ লিংক<small>Created automatically from the name. You can shorten it.</small></span>
        <div class="campaign-url-row"><span class="campaign-url-prefix" id="campaign-url-prefix">/campaign/</span><input name="slug" id="campaign-slug" placeholder="winter-glow-edit" autocomplete="off" /></div>
        <p class="campaign-url-preview" id="campaign-url-preview">Your ad link will appear here.</p>
      </div>

      <label>Small headline · ছোট শিরোনাম<input name="eyebrow" placeholder="Limited winter edit" /></label>
      <label>Description · বিবরণ<textarea name="description" rows="4" placeholder="One or two lines that explain the offer."></textarea></label>

      <div class="campaign-image-field">
        <span class="setting-label">Main picture · প্রধান ছবি<small>Square 1080×1080, under 500 KB, WebP or JPG.</small></span>
        <input name="imageUrl" id="campaign-image-url" placeholder="https://... or /assets/..." />
        <div class="upload-line"><input id="campaign-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" /><button id="campaign-image-upload" class="icon-action" type="button">Upload picture</button></div>
        <img id="campaign-image-preview" class="image-preview hidden" alt="Campaign picture preview" />
      </div>

      <details class="campaign-advanced">
        <summary>Facebook / Instagram share card · শেয়ার কার্ড</summary>
        <p class="muted">Leave both empty and the campaign name and description are used automatically.</p>
        <label>Share title<input name="metaTitle" maxlength="160" placeholder="Winter Glow Edit · Rinova BD" /></label>
        <label>Share description<textarea name="metaDescription" rows="2" maxlength="320" placeholder="Up to 200 characters shown under the ad link."></textarea></label>
      </details>

      <div class="campaign-picker">
        <div class="campaign-picker-head"><span class="setting-label">Products on this page · এই পেজের প্রোডাক্ট<small>Tick the products this ad should sell. Leave all unticked to show your featured products.</small></span><span class="metric-chip" id="campaign-selected-count">0 selected</span></div>
        <input id="campaign-product-search" class="campaign-picker-search" type="search" placeholder="Search products by name or SKU" autocomplete="off" />
        <div id="campaign-product-picker" class="campaign-product-picker"><p class="muted">Loading products…</p></div>
      </div>

      <div class="form-grid">
        <label>Start date <span class="muted">(optional)</span><input name="startsAt" type="date" /></label>
        <label>End date <span class="muted">(optional)</span><input name="endsAt" type="date" /></label>
      </div>

      <label>Status · অবস্থা<select name="active"><option value="0">Paused · শুধু আপনি দেখবেন</option><option value="1">Active · কাস্টমার দেখতে পাবে</option></select></label>

      <div class="form-actions"><button class="button button-dark" type="submit" id="campaign-submit">Create campaign</button><span id="campaign-message" class="form-message"></span></div>
    </form>`;
  }

  function mountCampaignView() {
    const main = document.querySelector('#app-shell main'); if (!main || document.getElementById('view-campaigns')) return;
    const nav = document.querySelector('.sidebar nav');
    if (nav && !nav.querySelector('[data-view="campaigns"]')) {
      const button = document.createElement('button');
      button.className = 'nav-item';
      button.dataset.view = 'campaigns';
      button.innerHTML = '<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1Z"/><path d="M17 9a4 4 0 0 1 0 6"/></svg></span><span>Campaign Studio</span><span class="nav-badge">ADS</span>';
      button.addEventListener('click', () => { window.loadView?.('campaigns'); openCampaignStudio(); });
      const settings = nav.querySelector('[data-view="settings"]');
      settings?.parentNode?.insertBefore(button, settings);
    }
    const section = document.createElement('section');
    section.id = 'view-campaigns';
    section.className = 'view hidden';
    section.innerHTML = `<div class="section-toolbar"><div><p class="eyebrow">CAMPAIGN OPERATIONS</p><p class="muted">Build a separate landing page for a Facebook or Instagram ad. It has its own link and never changes your main shop.</p></div><span class="privacy-chip">Ads only · isolated</span></div>`
      + `<div class="campaign-admin-grid">${campaignFormMarkup()}<div class="panel"><div class="panel-heading"><div><p class="eyebrow">YOUR CAMPAIGNS</p><h3>Campaign pages</h3><p class="muted">Copy a link straight into Meta Ads Manager.</p></div></div><div id="campaign-list" class="campaign-list"><p class="muted">Loading campaigns…</p></div></div></div>`
      + `<section class="panel tracking-panel"><div class="panel-heading"><div><p class="eyebrow">MEASUREMENT</p><h3>Tracking &amp; Analytics</h3><p class="muted">Public IDs are stored in D1. CAPI secrets remain Worker secrets.</p></div><button id="tracking-verify" class="button button-dark" type="button">Verify connections</button></div><form id="tracking-form" class="tracking-form"><label>GTM Container ID<input name="gtmId" placeholder="GTM-XXXXXXX" /></label><label>GA4 Measurement ID<input name="ga4MeasurementId" placeholder="G-XXXXXXX" /></label><label>Meta Pixel ID<input name="metaPixelId" placeholder="1234567890" /></label><label>GSC Site URL<input name="gscSiteUrl" placeholder="https://rinovabd.com/" /></label><label>Meta CAPI Token <small>Worker secret status only</small><input name="capiToken" readonly value="Loading…" /></label><button class="button" type="submit">Save tracking IDs</button><p id="tracking-message" class="form-message"></p></form><div id="tracking-results" class="tracking-results"><p class="muted">Run verification to check GA4, GSC, Sheets, GTM, and Meta CAPI.</p></div></section>`;
    main.appendChild(section);

    const form = document.getElementById('campaign-form');
    form.addEventListener('submit', saveCampaign);
    document.getElementById('campaign-cancel').addEventListener('click', resetCampaignForm);
    document.getElementById('campaign-image-upload').addEventListener('click', uploadCampaignImage);
    document.getElementById('campaign-image-file').addEventListener('change', uploadCampaignImage);
    document.getElementById('campaign-image-url').addEventListener('input', renderCampaignImagePreview);
    document.getElementById('campaign-product-search').addEventListener('input', (event) => { campaignState.search = event.target.value; renderCampaignPicker(); });

    // The link writes itself from the name until the owner edits it by hand.
    const slugInput = document.getElementById('campaign-slug');
    form.elements.title.addEventListener('input', () => { if (slugInput.dataset.touched !== 'true') slugInput.value = slugify(form.elements.title.value); renderCampaignUrl(); });
    slugInput.addEventListener('input', () => { slugInput.dataset.touched = 'true'; renderCampaignUrl(); });
    slugInput.addEventListener('blur', () => { slugInput.value = slugify(slugInput.value); renderCampaignUrl(); });
    document.getElementById('campaign-url-prefix').textContent = `${location.origin}/campaign/`;

    document.getElementById('tracking-form').addEventListener('submit', async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget).entries()); delete body.capiToken; try { await api('/admin/tracking/settings', { method: 'PUT', body: JSON.stringify(body) }); document.getElementById('tracking-message').textContent = 'Tracking IDs saved. CAPI token remains protected as a Worker secret.'; } catch (error) { document.getElementById('tracking-message').textContent = error.message; } });
    document.getElementById('tracking-verify').addEventListener('click', verifyTracking);
    if (new URLSearchParams(location.search).get('view') === 'campaigns') openCampaignStudio();
  }

  function openCampaignStudio() { loadCampaignProducts(); renderCampaigns(); loadTracking(); renderCampaignUrl(); }

  function renderCampaignUrl() {
    const slug = slugify(document.getElementById('campaign-slug')?.value || document.querySelector('#campaign-form [name="title"]')?.value || '');
    const node = document.getElementById('campaign-url-preview');
    if (node) node.textContent = slug ? `${location.origin}/campaign/${slug}` : 'Your ad link will appear here.';
  }

  function renderCampaignImagePreview() {
    const url = document.getElementById('campaign-image-url')?.value.trim();
    const preview = document.getElementById('campaign-image-preview');
    if (!preview) return;
    preview.classList.toggle('hidden', !url);
    if (url) preview.src = url;
  }

  async function uploadCampaignImage() {
    const input = document.getElementById('campaign-image-file');
    const message = document.getElementById('campaign-message');
    const file = input?.files?.[0];
    if (!file) { if (message) message.textContent = 'Choose a picture first.'; return; }
    if (message) message.textContent = 'Uploading picture…';
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${apiBase()}/admin/product-media`, { method: 'POST', headers: auth(), body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Upload failed.');
      document.getElementById('campaign-image-url').value = data.media?.url || '';
      renderCampaignImagePreview();
      input.value = '';
      if (message) message.textContent = 'Picture uploaded.';
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  async function loadCampaignProducts() {
    if (campaignState.products.length) return renderCampaignPicker();
    try {
      const data = await api('/admin/products?status=active');
      campaignState.products = data.products || [];
    } catch {
      campaignState.products = [];
    }
    renderCampaignPicker();
  }

  function renderCampaignPicker() {
    const node = document.getElementById('campaign-product-picker');
    if (!node) return;
    const term = campaignState.search.trim().toLowerCase();
    const rows = campaignState.products.filter((product) => !term || `${product.name} ${product.sku}`.toLowerCase().includes(term));
    node.innerHTML = rows.length
      ? rows.map((product) => `<label class="campaign-product-option${campaignState.selected.has(Number(product.id)) ? ' selected' : ''}"><input type="checkbox" value="${Number(product.id)}" ${campaignState.selected.has(Number(product.id)) ? 'checked' : ''} /><img src="${esc(product.imageUrl || '/assets/rinova-bd-hero-pink.png')}" alt="" loading="lazy" /><span><strong>${esc(product.name)}</strong><small>${esc(product.sku)} · ৳${Number(product.price || 0).toLocaleString('en-BD')}</small></span></label>`).join('')
      : '<p class="muted">No matching products.</p>';
    node.querySelectorAll('input[type="checkbox"]').forEach((box) => box.addEventListener('change', () => {
      const id = Number(box.value);
      if (box.checked) campaignState.selected.add(id); else campaignState.selected.delete(id);
      box.closest('.campaign-product-option')?.classList.toggle('selected', box.checked);
      updateCampaignSelectedCount();
    }));
    updateCampaignSelectedCount();
  }

  function updateCampaignSelectedCount() {
    const node = document.getElementById('campaign-selected-count');
    if (node) node.textContent = campaignState.selected.size ? `${campaignState.selected.size} selected` : 'Featured products';
  }

  function resetCampaignForm() {
    const form = document.getElementById('campaign-form');
    if (!form) return;
    form.reset();
    campaignState.editingId = null;
    campaignState.selected = new Set();
    campaignState.search = '';
    const slugInput = document.getElementById('campaign-slug');
    if (slugInput) slugInput.dataset.touched = 'false';
    document.getElementById('campaign-product-search').value = '';
    document.getElementById('campaign-form-eyebrow').textContent = 'NEW CAMPAIGN';
    document.getElementById('campaign-form-title').textContent = 'Ad landing page';
    document.getElementById('campaign-submit').textContent = 'Create campaign';
    document.getElementById('campaign-cancel').hidden = true;
    document.getElementById('campaign-message').textContent = '';
    renderCampaignImagePreview();
    renderCampaignPicker();
    renderCampaignUrl();
  }

  async function editCampaign(id) {
    try {
      const { campaign } = await api(`/admin/campaigns/${id}`);
      const form = document.getElementById('campaign-form');
      campaignState.editingId = campaign.id;
      campaignState.selected = new Set((campaign.productIds || []).map(Number));
      form.elements.title.value = campaign.title || '';
      form.elements.slug.value = campaign.slug || '';
      form.elements.eyebrow.value = campaign.eyebrow || '';
      form.elements.description.value = campaign.description || '';
      form.elements.imageUrl.value = campaign.imageUrl || '';
      form.elements.metaTitle.value = campaign.metaTitle || '';
      form.elements.metaDescription.value = campaign.metaDescription || '';
      form.elements.startsAt.value = (campaign.startsAt || '').slice(0, 10);
      form.elements.endsAt.value = (campaign.endsAt || '').slice(0, 10);
      form.elements.active.value = Number(campaign.active) ? '1' : '0';
      document.getElementById('campaign-slug').dataset.touched = 'true';
      document.getElementById('campaign-form-eyebrow').textContent = 'EDIT CAMPAIGN';
      document.getElementById('campaign-form-title').textContent = campaign.title || 'Ad landing page';
      document.getElementById('campaign-submit').textContent = 'Save changes';
      document.getElementById('campaign-cancel').hidden = false;
      document.getElementById('campaign-message').textContent = '';
      renderCampaignImagePreview();
      renderCampaignPicker();
      renderCampaignUrl();
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      document.getElementById('campaign-message').textContent = error.message;
    }
  }

  async function saveCampaign(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById('campaign-message');
    const values = Object.fromEntries(new FormData(form).entries());
    const body = {
      title: values.title,
      slug: slugify(values.slug || values.title),
      eyebrow: values.eyebrow,
      description: values.description,
      imageUrl: values.imageUrl,
      metaTitle: values.metaTitle,
      metaDescription: values.metaDescription,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      active: values.active === '1',
      productIds: [...campaignState.selected],
    };
    message.textContent = 'Saving…';
    try {
      const result = campaignState.editingId
        ? await api(`/admin/campaigns/${campaignState.editingId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await api('/admin/campaigns', { method: 'POST', body: JSON.stringify(body) });
      const url = result.url || `${location.origin}/campaign/${result.slug}`;
      message.innerHTML = `Saved. Your ad link: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`;
      window.toast?.(campaignState.editingId ? 'Campaign updated' : 'Campaign created');
      const wasEditing = campaignState.editingId;
      resetCampaignForm();
      if (!wasEditing) message.innerHTML = `Created. Your ad link: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`;
      renderCampaigns();
    } catch (error) {
      message.textContent = error.message;
    }
  }

  async function renderCampaigns() {
    const node = document.getElementById('campaign-list');
    if (!node) return;
    try {
      const data = await api('/admin/campaigns');
      const campaigns = data.campaigns || [];
      node.innerHTML = campaigns.length ? campaigns.map((campaign) => {
        const live = Boolean(campaign.live);
        const url = campaign.url || `${location.origin}/campaign/${campaign.slug}`;
        // A paused page 404s for customers, so the owner's link has to carry the preview flag.
        const openUrl = live ? url : `${url}?preview=1`;
        const count = (campaign.productIds || []).length;
        return `<article class="campaign-row"><div class="campaign-row-main"><div class="campaign-row-title"><strong>${esc(campaign.title)}</strong><span class="status-pill ${live ? 'active' : 'draft'}">${live ? 'Active' : 'Paused'}</span></div><a class="campaign-row-url" href="${esc(openUrl)}" target="_blank" rel="noopener">${esc(url)}</a><small>${count ? `${count} product${count > 1 ? 's' : ''} on this page` : 'Showing featured products'}${campaign.startsAt || campaign.endsAt ? ` · ${esc(campaign.startsAt || 'now')} → ${esc(campaign.endsAt || 'no end date')}` : ''}</small></div><div class="campaign-row-actions"><button class="icon-action" type="button" data-campaign-copy="${esc(url)}">Copy link</button><a class="icon-action" href="${esc(openUrl)}" target="_blank" rel="noopener">Open page</a><button class="icon-action" type="button" data-campaign-edit="${campaign.id}">Edit</button><button class="icon-action" type="button" data-campaign-toggle="${campaign.id}" data-active="${live ? '0' : '1'}">${live ? 'Pause' : 'Activate'}</button><button class="icon-action" type="button" data-campaign-delete="${campaign.id}" data-title="${esc(campaign.title)}">Delete</button></div></article>`;
      }).join('') : '<p class="muted">No campaigns yet. Create your first ad landing page on the left.</p>';

      node.querySelectorAll('[data-campaign-copy]').forEach((button) => button.addEventListener('click', () => window.copyToClipboard?.(button.dataset.campaignCopy, 'Campaign link copied')));
      node.querySelectorAll('[data-campaign-edit]').forEach((button) => button.addEventListener('click', () => editCampaign(button.dataset.campaignEdit)));
      node.querySelectorAll('[data-campaign-toggle]').forEach((button) => button.addEventListener('click', async () => {
        button.disabled = true;
        try { await api(`/admin/campaigns/${button.dataset.campaignToggle}`, { method: 'PATCH', body: JSON.stringify({ active: button.dataset.active === '1' }) }); renderCampaigns(); }
        catch (error) { document.getElementById('campaign-message').textContent = error.message; button.disabled = false; }
      }));
      node.querySelectorAll('[data-campaign-delete]').forEach((button) => button.addEventListener('click', async () => {
        if (!window.confirm(`Delete the campaign "${button.dataset.title}"? Its ad link will stop working.`)) return;
        try { await api(`/admin/campaigns/${button.dataset.campaignDelete}`, { method: 'DELETE' }); if (Number(campaignState.editingId) === Number(button.dataset.campaignDelete)) resetCampaignForm(); renderCampaigns(); }
        catch (error) { document.getElementById('campaign-message').textContent = error.message; }
      }));
    } catch (error) {
      node.innerHTML = `<p class="form-message">${esc(error.message)}</p>`;
    }
  }

  async function loadTracking() { try { const data = await api('/admin/tracking/settings'); const form = document.getElementById('tracking-form'); if (!form) return; for (const [key, value] of Object.entries({ gtmId: data.gtmId, ga4MeasurementId: data.ga4MeasurementId, metaPixelId: data.metaPixelId, gscSiteUrl: data.gscSiteUrl, capiToken: data.capiToken })) if (form.elements[key]) form.elements[key].value = value || ''; } catch (error) { const message = document.getElementById('tracking-message'); if (message) message.textContent = error.message; } }
  async function verifyTracking() { const node = document.getElementById('tracking-results'); const button = document.getElementById('tracking-verify'); if (!node || !button) return; button.disabled = true; node.innerHTML = '<p class="muted">Verifying Google and Meta services…</p>'; try { const data = await api('/admin/tracking/verify', { method: 'POST', body: '{}' }); node.innerHTML = Object.entries(data.results || {}).map(([service, result]) => `<div class="tracking-result-row"><span><strong>${esc(service.toUpperCase())}</strong><small>${esc(result.message)}</small></span>${statusBadge(result.status)}</div>`).join(''); } catch (error) { node.innerHTML = `<p class="form-message">${esc(error.message)}</p>`; } finally { button.disabled = false; } }
  document.addEventListener('DOMContentLoaded', () => { mountCampaignView(); });
})();
