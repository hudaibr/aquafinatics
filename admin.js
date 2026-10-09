(() => {
  'use strict';

  const config = window.AQUA_SUPABASE_CONFIG || {};
  const projectUrl = String(config.url || '').trim().replace(/\/+$/, '');
  const publicKey = String(config.publishableKey || config.anonKey || '').trim();
  const configured = /^https:\/\//i.test(projectUrl) && publicKey.length > 20;
  const sessionKey = 'aqua-admin-session-v1';
  const imageBucket = 'product-images';
  const categories = {
    fish: 'Fish',
    prawns: 'Prawns',
    crustaceans: 'Crab & lobster',
    special: 'Special seafood'
  };
  const $ = (selector) => document.querySelector(selector);
  const setupBanner = $('#setup-banner');
  const loginPanel = $('#login-panel');
  const dashboard = $('#dashboard');
  const loginForm = $('#login-form');
  const loginMessage = $('#login-message');
  const loginSubmit = $('#login-submit');
  const loginEmail = $('#login-email');
  const loginPassword = $('#login-password');
  const signOutButton = $('#sign-out');
  const rows = $('#product-rows');
  const productCount = $('#product-count');
  const dashboardMessage = $('#dashboard-message');
  const editorPanel = $('#editor-panel');
  const productForm = $('#product-form');
  const saveMessage = $('#save-message');
  const imageFile = $('#product-image-file');
  const imageUrl = $('#product-image-url');
  const imagePreview = $('#image-preview');

  let session = null;
  let products = [];
  let editingProduct = null;
  let previewObjectUrl = '';

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function categoryLabel(value) {
    return categories[value] || 'Other';
  }

  function fallbackImage(product) {
    const name = String(product.name || '').toLowerCase();
    const category = product.category;
    let file = 'silver-fish.png';
    if (category === 'prawns') file = 'prawn.webp';
    else if (category === 'crustaceans') file = name.includes('lobster') ? 'lobster.png' : 'crab.png';
    else if (category === 'special') {
      if (/oyster|mussel|shell|clam|babylon/.test(name)) file = 'shellfish.png';
      else if (name.includes('cuttle')) file = 'cuttlefish.png';
      else file = 'squid.png';
    } else if (/pomfret|paplet/.test(name)) file = 'pomfret.png';
    else if (/cat ?fish/.test(name)) file = 'catfish.png';
    else if (/tuna/.test(name)) file = 'tuna.png';
    else if (/snapper|jobfish/.test(name)) file = 'snapper.png';
    else if (/sardine/.test(name)) file = 'sardine.png';
    else if (/salmon/.test(name)) file = 'salmon.png';
    else if (/mackerel|king fish/.test(name)) file = 'surmai.png';
    else if (/sole|halibut|flathead|bombay duck/.test(name)) file = 'slender-fish.png';
    else if (/bream|bhetki|hamour/.test(name)) file = 'sea-bream.png';
    return `assets/images/${file}`;
  }

  function safeImageSource(raw, product) {
    const value = String(raw || '').trim();
    if (value) {
      try {
        const url = new URL(value, window.location.href);
        if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
      } catch (_) { /* Use the local representative image below. */ }
    }
    return fallbackImage(product || { category: 'fish', name: '' });
  }

  function updatePreview(source, product) {
    imagePreview.replaceChildren();
    const value = source || safeImageSource('', product);
    const img = document.createElement('img');
    img.alt = 'Selected product image preview';
    img.src = value;
    img.onerror = () => {
      imagePreview.replaceChildren();
      const text = document.createElement('span');
      text.textContent = 'Image preview unavailable';
      imagePreview.append(text);
    };
    imagePreview.append(img);
  }

  function setSession(value) {
    session = value;
    try {
      if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
      else sessionStorage.removeItem(sessionKey);
    } catch (_) { /* This tab can still use an in-memory session when storage is blocked. */ }
  }

  function readSession() {
    try {
      const value = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
      return value && value.access_token ? value : null;
    } catch (_) {
      return null;
    }
  }

  async function authRequest(path, body) {
    return fetch(`${projectUrl}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: publicKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }

  async function refreshSession() {
    if (!session || !session.refresh_token) return false;
    try {
      const response = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      const data = await response.json();
      if (!response.ok || !data.access_token) {
        setSession(null);
        return false;
      }
      setSession(data);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function adminFetch(path, options = {}, allowRefresh = true) {
    if (!session || !session.access_token) throw new Error('Please sign in again.');
    const headers = new Headers(options.headers || {});
    headers.set('apikey', publicKey);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    if (options.body && !(options.body instanceof FormData) && !(options.body instanceof Blob) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    let response = await fetch(`${projectUrl}${path}`, { ...options, headers });
    if (response.status === 401 && allowRefresh && await refreshSession()) {
      return adminFetch(path, options, false);
    }
    return response;
  }

  async function responseError(response) {
    let body = {};
    try { body = await response.json(); } catch (_) { /* Response may be empty. */ }
    return body.message || body.msg || body.error_description || body.error || `Request failed (${response.status}).`;
  }

  function normalizedProduct(row) {
    return {
      ...row,
      name: String(row.name || ''),
      local_name: String(row.local_name || ''),
      detail: String(row.detail || ''),
      price_low: Number(row.price_low),
      price_high: Number(row.price_high),
      in_stock: Boolean(row.in_stock),
      image_url: String(row.image_url || ''),
      sort_order: Number(row.sort_order) || 0
    };
  }

  function filteredProducts() {
    const term = $('#catalog-search').value.trim().toLowerCase();
    const category = $('#category-filter').value;
    return products.filter((product) => {
      const matchesCategory = category === 'all' || product.category === category;
      const searchable = `${product.name} ${product.local_name} ${product.detail}`.toLowerCase();
      return matchesCategory && (!term || searchable.includes(term));
    });
  }

  function renderRows() {
    const filtered = filteredProducts();
    productCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'product' : 'products'}`;
    if (!filtered.length) {
      rows.innerHTML = '<tr><td colspan="5" class="table-empty">No matching products. Add a product to get started.</td></tr>';
      return;
    }
    rows.innerHTML = filtered.map((product) => {
      const image = safeImageSource(product.image_url, product);
      const local = product.local_name ? `<small>${escapeHTML(product.local_name)}</small>` : '';
      const max = Number(product.price_high) === Number(product.price_low) ? '' : `–${formatNumber(product.price_high)}`;
      const price = `PKR ${formatNumber(product.price_low)}${max}`;
      return `<tr>
        <td><div class="product-cell"><span class="product-thumb"><img src="${escapeHTML(image)}" alt="" loading="lazy"></span><span class="product-cell-copy"><strong>${escapeHTML(product.name)}</strong>${local}</span></div></td>
        <td><span class="category-badge">${escapeHTML(categoryLabel(product.category))}</span></td>
        <td><span class="table-price">${price}<small>PKR / kg</small></span></td>
        <td><span class="stock-badge${product.in_stock ? '' : ' out'}">${product.in_stock ? 'Available' : 'Out of stock'}</span></td>
        <td><span class="row-actions"><button class="row-action" type="button" data-edit-id="${escapeHTML(product.id)}" aria-label="Edit ${escapeHTML(product.name)}" title="Edit">✎</button><button class="row-action delete" type="button" data-delete-id="${escapeHTML(product.id)}" aria-label="Delete ${escapeHTML(product.name)}" title="Delete">×</button></span></td>
      </tr>`;
    }).join('');
  }

  async function loadProducts() {
    const response = await adminFetch('/rest/v1/products?select=id,name,local_name,detail,category,price_low,price_high,in_stock,image_url,sort_order,updated_at&order=sort_order.asc,name.asc');
    if (!response.ok) throw new Error(await responseError(response));
    const data = await response.json();
    products = Array.isArray(data) ? data.map(normalizedProduct) : [];
    renderRows();
    return products;
  }

  async function isAllowedAdmin() {
    const response = await adminFetch('/rest/v1/rpc/is_catalog_admin', { method: 'POST', body: '{}' });
    if (!response.ok) throw new Error(await responseError(response));
    return response.json();
  }

  function showDashboard() {
    loginPanel.hidden = true;
    dashboard.hidden = false;
    signOutButton.hidden = false;
  }

  function showLogin() {
    loginPanel.hidden = false;
    dashboard.hidden = true;
    signOutButton.hidden = true;
  }

  function setDashboardMessage(message, error = false) {
    dashboardMessage.textContent = message;
    dashboardMessage.classList.toggle('error', error);
    dashboardMessage.hidden = !message;
  }

  async function establishDashboard() {
    const allowed = await isAllowedAdmin();
    if (allowed !== true) {
      setSession(null);
      throw new Error('This account is not on the Aqua Finatics admin allow-list.');
    }
    await loadProducts();
    showDashboard();
    setDashboardMessage('Connected. Changes you save here are shared with storefront visitors.');
  }

  function syncEditorLayout() {
    $('#admin-content').classList.toggle('has-editor', !editorPanel.hidden);
  }

  function clearEditor() {
    productForm.reset();
    $('#product-id').value = '';
    $('#product-category').value = 'fish';
    $('#product-stock').checked = true;
    $('#price-low').value = '';
    $('#price-high').value = '';
    $('#editor-title').textContent = 'Add a product';
    $('#save-product').textContent = 'Save product';
    saveMessage.textContent = '';
    saveMessage.classList.remove('success');
    editingProduct = null;
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = '';
    }
    updatePreview('', { category: 'fish', name: '' });
  }

  function openNewProduct() {
    clearEditor();
    editorPanel.hidden = false;
    syncEditorLayout();
    $('#product-name').focus({ preventScroll: true });
  }

  function openExistingProduct(product) {
    clearEditor();
    editingProduct = product;
    $('#product-id').value = product.id;
    $('#product-name').value = product.name;
    $('#product-local').value = product.local_name;
    $('#product-category').value = product.category;
    $('#price-low').value = product.price_low;
    $('#price-high').value = product.price_high;
    $('#product-detail').value = product.detail;
    $('#product-image-url').value = product.image_url;
    $('#product-stock').checked = product.in_stock;
    $('#editor-title').textContent = 'Edit product';
    $('#save-product').textContent = 'Save changes';
    updatePreview(safeImageSource(product.image_url, product), product);
    editorPanel.hidden = false;
    syncEditorLayout();
    $('#product-name').focus({ preventScroll: true });
  }

  function closeEditor() {
    editorPanel.hidden = true;
    syncEditorLayout();
    clearEditor();
  }

  function createProductId() {
    const random = window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `item-${random}`;
  }

  function safeFileName(name) {
    const base = String(name || 'seafood-image').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
    return base || 'seafood-image';
  }

  async function uploadProductImage(file, productId) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Image is larger than 8 MB. Please choose a smaller file.');
    const path = `catalog/${productId}/${Date.now()}-${safeFileName(file.name)}`;
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const response = await adminFetch(`/storage/v1/object/${imageBucket}/${encodedPath}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
      body: file
    });
    if (!response.ok) throw new Error(await responseError(response));
    return `${projectUrl}/storage/v1/object/public/${imageBucket}/${encodedPath}`;
  }

  function validateImageUrl(value) {
    if (!value) return '';
    let parsed;
    try { parsed = new URL(value); } catch (_) { throw new Error('Enter a complete image URL beginning with https://, or upload an image file.'); }
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Image URLs must use http or https.');
    return parsed.href;
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!session) return;
    saveMessage.textContent = '';
    saveMessage.classList.remove('success');
    const name = $('#product-name').value.trim();
    const low = Number($('#price-low').value);
    const highInput = $('#price-high').value.trim();
    const high = highInput === '' ? low : Number(highInput);
    if (!name) { saveMessage.textContent = 'Enter a product name.'; $('#product-name').focus(); return; }
    if (!Number.isFinite(low) || low < 0 || !Number.isFinite(high) || high < low) {
      saveMessage.textContent = 'Check the per-kg prices. The maximum must be at least the listed price.';
      return;
    }

    const id = editingProduct ? editingProduct.id : createProductId();
    const file = imageFile.files && imageFile.files[0];
    const button = $('#save-product');
    button.disabled = true;
    button.textContent = file ? 'Uploading image…' : 'Saving…';
    try {
      let chosenImageUrl = validateImageUrl(imageUrl.value.trim());
      if (file) chosenImageUrl = await uploadProductImage(file, id);
      const now = new Date().toISOString();
      const payload = {
        id,
        name,
        local_name: $('#product-local').value.trim(),
        category: $('#product-category').value,
        price_low: low,
        price_high: high,
        detail: $('#product-detail').value.trim(),
        image_url: chosenImageUrl,
        in_stock: $('#product-stock').checked,
        sort_order: editingProduct ? editingProduct.sort_order : products.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1,
        updated_at: now
      };
      const endpoint = editingProduct ? `/rest/v1/products?id=eq.${encodeURIComponent(id)}` : '/rest/v1/products';
      const response = await adminFetch(endpoint, {
        method: editingProduct ? 'PATCH' : 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await responseError(response));
      await loadProducts();
      setDashboardMessage(editingProduct ? `${name} was updated.` : `${name} was added to the catalogue.`);
      closeEditor();
    } catch (error) {
      saveMessage.textContent = error.message || 'Could not save this product. Check the Supabase setup and try again.';
    } finally {
      button.disabled = false;
      button.textContent = editingProduct ? 'Save changes' : 'Save product';
    }
  }

  async function deleteProduct(id) {
    const product = products.find((item) => item.id === id);
    if (!product || !window.confirm(`Delete ${product.name} from the catalogue? This cannot be undone.`)) return;
    setDashboardMessage('');
    try {
      const response = await adminFetch(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await responseError(response));
      products = products.filter((item) => item.id !== id);
      renderRows();
      if (editingProduct && editingProduct.id === id) closeEditor();
      setDashboardMessage(`${product.name} was removed.`);
    } catch (error) {
      setDashboardMessage(error.message || 'Could not delete this product.', true);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    loginMessage.textContent = '';
    loginMessage.classList.remove('success');
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    if (!email || !password) { loginMessage.textContent = 'Enter your admin email and password.'; return; }
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Signing in…';
    try {
      const response = await authRequest('token?grant_type=password', { email, password });
      const data = await response.json();
      if (!response.ok || !data.access_token) throw new Error(data.msg || data.message || 'Sign-in failed. Check your details and try again.');
      setSession(data);
      loginPassword.value = '';
      await establishDashboard();
    } catch (error) {
      setSession(null);
      showLogin();
      loginMessage.textContent = error.message || 'Sign-in failed. Check the Supabase configuration and try again.';
    } finally {
      loginSubmit.disabled = false;
      loginSubmit.innerHTML = 'Sign in <span aria-hidden="true">→</span>';
    }
  }

  async function handleSignOut() {
    const active = session;
    setSession(null);
    showLogin();
    dashboardMessage.hidden = true;
    products = [];
    renderRows();
    if (active && active.access_token) {
      try {
        await fetch(`${projectUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: { apikey: publicKey, Authorization: `Bearer ${active.access_token}` }
        });
      } catch (_) { /* Local session is already cleared. */ }
    }
  }

  function setPreviewFromInputs() {
    const file = imageFile.files && imageFile.files[0];
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = '';
    }
    const current = {
      name: $('#product-name').value,
      category: $('#product-category').value
    };
    if (file) {
      previewObjectUrl = URL.createObjectURL(file);
      updatePreview(previewObjectUrl, current);
      return;
    }
    updatePreview(safeImageSource(imageUrl.value.trim(), editingProduct || current), current);
  }

  if (!configured) {
    setupBanner.hidden = false;
    loginEmail.disabled = true;
    loginPassword.disabled = true;
    loginSubmit.disabled = true;
    loginMessage.textContent = 'Add the Supabase project URL and public key to enable sign-in.';
    return;
  }

  setupBanner.hidden = true;
  loginEmail.disabled = false;
  loginPassword.disabled = false;
  loginSubmit.disabled = false;
  loginForm.addEventListener('submit', handleLogin);
  signOutButton.addEventListener('click', handleSignOut);
  $('#add-product').addEventListener('click', openNewProduct);
  $('#close-editor').addEventListener('click', closeEditor);
  $('#cancel-edit').addEventListener('click', closeEditor);
  productForm.addEventListener('submit', saveProduct);
  $('#catalog-search').addEventListener('input', renderRows);
  $('#category-filter').addEventListener('change', renderRows);
  imageFile.addEventListener('change', setPreviewFromInputs);
  imageUrl.addEventListener('input', () => { if (!imageFile.files.length) setPreviewFromInputs(); });
  $('#product-name').addEventListener('input', () => { if (!imageFile.files.length && !imageUrl.value.trim()) setPreviewFromInputs(); });
  $('#product-category').addEventListener('change', () => { if (!imageFile.files.length && !imageUrl.value.trim()) setPreviewFromInputs(); });
  rows.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit-id]');
    if (editButton) {
      const product = products.find((item) => item.id === editButton.dataset.editId);
      if (product) openExistingProduct(product);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-id]');
    if (deleteButton) deleteProduct(deleteButton.dataset.deleteId);
  });

  const saved = readSession();
  if (saved) {
    setSession(saved);
    loginMessage.textContent = 'Checking your admin session…';
    establishDashboard().catch((error) => {
      setSession(null);
      showLogin();
      loginMessage.textContent = error.message || 'Your session expired. Please sign in again.';
    });
  }
})();
