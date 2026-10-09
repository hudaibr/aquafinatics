(() => {
  'use strict';

  const products = Array.isArray(window.AQUA_PRODUCTS) ? window.AQUA_PRODUCTS : [];
  const supabaseConfig = window.AQUA_SUPABASE_CONFIG || {};
  const supabaseUrl = String(supabaseConfig.url || '').trim().replace(/\/+$/, '');
  const supabasePublicKey = String(supabaseConfig.publishableKey || supabaseConfig.anonKey || '').trim();
  const WHATSAPP_NUMBER = '923703409201';
  const DELIVERY_CHARGE = 250;
  const CART_KEY = 'aqua-finatics-cart-v1';
  const PAGE_SIZE = 12;
  const categoryLabels = {
    fish: 'Fish',
    prawns: 'Prawns',
    crustaceans: 'Crab & lobster',
    special: 'Special seafood'
  };
  const imageRoot = 'assets/images/';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const grid = $('#product-grid');
  const searchInput = $('#product-search');
  const heroSearchInput = $('#hero-search');
  const heroSearchForm = $('#hero-search-form');
  const loadSentinel = $('#load-sentinel');
  const supportsInfiniteScroll = 'IntersectionObserver' in window;
  const resultCount = $('#results-count');
  const loadMoreButton = $('#load-more');
  const emptyState = $('#empty-state');
  const cartDrawer = $('#cart-drawer');
  const backdrop = $('#drawer-backdrop');
  const cartLines = $('#cart-lines');
  const cartEmpty = $('#cart-empty');
  const checkoutFields = $('#checkout-fields');
  const drawerFooter = $('#drawer-footer');
  const customerName = $('#customer-name');
  const customerAddress = $('#customer-address');
  const toast = $('#toast');

  let activeCategory = 'all';
  let query = '';
  let visibleCount = PAGE_SIZE;
  let toastTimer = 0;
  const cart = new Map();

  function formatNumber(value) {
    try {
      return new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(value);
    } catch (_) {
      return Math.round(value).toLocaleString('en');
    }
  }

  function formatQuantity(value) {
    const rounded = Math.round(value * 2) / 2;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function formatPrice(low, high = low) {
    const start = `PKR ${formatNumber(low)}`;
    return low === high ? start : `${start}–${formatNumber(high)}`;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function productImage(product) {
    const name = product.name.toLowerCase();
    const local = (product.local || '').toLowerCase();
    const idText = String(product.id || product.name || '');
    const idSuffix = (idText.match(/(\d+)$/) || [])[1];
    let fishNumber = Number(idSuffix) || 0;
    if (!fishNumber) fishNumber = Array.from(idText).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) || 1;
    const pick = (images) => images[(fishNumber - 1) % images.length];

    if (product.category === 'prawns') return 'prawn.webp';
    if (product.category === 'crustaceans') return name.includes('lobster') ? 'lobster.png' : 'crab.png';
    if (product.category === 'special') {
      if (/oyster|mussel|shell|clam|babylon/.test(name)) return 'shellfish.png';
      if (name.includes('cuttle')) return 'cuttlefish.png';
      return 'squid.png';
    }

    // Give closely related fish different representative cut-outs where possible.
    if (name === 'white pomfret') return 'pomfret.png';
    if (name === 'silver pomfret') return 'silver-fish.png';
    if (name === 'black pomfret') return 'blue-bream.png';
    if (local.includes('paplet')) return 'pomfret.png';
    if (name === 'bhetki') return 'sea-bream.png';
    if (name === 'white barracuda') return 'slender-fish.png';
    if (name === 'black barracuda') return 'mackerel-pair.png';
    if (/shark/.test(name)) return 'silver-fish.png';
    if (/cat fish/.test(name)) return 'catfish.png';
    if (name.includes('king fish')) return 'surmai.png';
    if (name.includes('horse mackerel')) return 'mackerel-pair.png';
    if (name.includes('indian mackerel')) return 'surmai.png';
    if (/sardine/.test(name)) return 'sardine.png';
    if (/tuna/.test(name)) return 'tuna.png';
    if (/salmon/.test(name)) return 'salmon.png';
    if (/snapper|jobfish|dentex|parrot fish/.test(name)) return 'snapper.png';
    if (/sole|halibut|flathead|bombay duck|lady fish|mullet|sicklefish/.test(name)) return 'slender-fish.png';
    if (name === 'sea bream') return product.id === 'fish-49' ? 'silver-fish.png' : 'sea-bream.png';
    if (/bream|hamour|bhetki|corvina|croaker|reef cod|grunter|emperor/.test(name)) {
      return pick(['sea-bream.png', 'blue-bream.png', 'silver-fish.png', 'slender-fish.png']);
    }
    if (/trevally|amberjack|cobia|mahi mahi|queen fish/.test(name)) {
      return pick(['tuna.png', 'surmai.png', 'mackerel-pair.png', 'salmon.png']);
    }
    if (/milk fish|rabbit fish|pompano/.test(name)) {
      return pick(['silver-fish.png', 'blue-bream.png', 'sea-bream.png']);
    }

    // Rotate through locally stored fish cut-outs for remaining varieties rather than
    // repeating one generic image across the whole fish catalogue.
    return pick(['salmon.png', 'tuna.png', 'sea-bream.png', 'slender-fish.png', 'blue-bream.png', 'snapper.png', 'mackerel-pair.png', 'silver-fish.png']);
  }

  function getProduct(id) {
    return products.find((product) => product.id === id);
  }

  function currentCartEntries() {
    return Array.from(cart.entries())
      .map(([id, quantity]) => ({ product: getProduct(id), quantity }))
      .filter((entry) => entry.product && entry.quantity > 0);
  }

  function readCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(saved)) return;
      saved.forEach((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2) return;
        const [id, amount] = entry;
        const product = getProduct(id);
        const quantity = Math.round(Number(amount) * 2) / 2;
        if (product && product.inStock && Number.isFinite(quantity) && quantity > 0 && quantity <= 99) {
          cart.set(id, quantity);
        }
      });
    } catch (_) {
      // The basket still works for this visit when browser storage is disabled.
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(Array.from(cart.entries())));
    } catch (_) {
      // Private browsing and embedded previews can block storage; keep the in-memory basket usable.
    }
  }

  function imageMarkup(product, extraClass = '') {
    const fallback = `${imageRoot}${productImage(product)}`;
    const custom = String(product.imageUrl || product.image_url || '').trim();
    let source = fallback;
    try {
      const parsed = new URL(custom);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') source = parsed.href;
    } catch (_) { /* Keep the local cut-out as a safe fallback. */ }
    const fallbackAttribute = source === fallback ? '' : ` data-fallback="${escapeHTML(fallback)}"`;
    return `<img class="${escapeHTML(extraClass)}" src="${escapeHTML(source)}"${fallbackAttribute} alt="" loading="lazy" decoding="async">`;
  }

  function normalizeRemoteProduct(row) {
    const low = Number(row.price_low);
    const high = Number(row.price_high);
    const allowedCategories = ['fish', 'prawns', 'crustaceans', 'special'];
    if (!row.id || !row.name || !allowedCategories.includes(row.category) || !Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) return null;
    return {
      id: String(row.id),
      name: String(row.name),
      local: String(row.local_name || ''),
      detail: String(row.detail || ''),
      category: row.category,
      low,
      high,
      inStock: Boolean(row.in_stock),
      imageUrl: String(row.image_url || '')
    };
  }

  async function loadRemoteCatalog() {
    if (!supabaseUrl || !supabasePublicKey) return;
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/products?select=id,name,local_name,detail,category,price_low,price_high,in_stock,image_url,sort_order&order=sort_order.asc,name.asc`, {
        headers: { apikey: supabasePublicKey }
      });
      if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('Catalogue response was not a list.');
      products.splice(0, products.length, ...rows.map(normalizeRemoteProduct).filter(Boolean));
      for (const id of Array.from(cart.keys())) {
        const current = products.find((product) => product.id === id);
        if (!current || !current.inStock) cart.delete(id);
      }
      saveCart();
      renderProducts();
      renderCart();
    } catch (error) {
      console.warn('Could not load the shared catalogue; using the bundled catalogue instead.', error);
    }
  }

  document.addEventListener('error', (event) => {
    const image = event.target;
    if (image && image.tagName === 'IMG' && image.dataset.fallback && image.dataset.fallbackTried !== 'true') {
      image.dataset.fallbackTried = 'true';
      image.src = image.dataset.fallback;
    }
  }, true);

  function productCard(product) {
    const quantity = cart.get(product.id) || 0;
    const stock = product.inStock;
    const tags = [];
    if (product.local) tags.push(`<span class="local-name" title="Local name: ${escapeHTML(product.local)}">${escapeHTML(product.local)}</span>`);
    if (product.detail) tags.push(`<span class="product-detail">${escapeHTML(product.detail)}</span>`);
    const stockLabel = stock ? 'In stock · confirm on WhatsApp' : 'Out of stock';
    const price = formatPrice(product.low, product.high);
    let action;
    if (!stock) {
      action = '<button class="add-button" type="button" disabled>Unavailable</button>';
    } else if (quantity > 0) {
      action = `<div class="mini-quantity" aria-label="Quantity for ${escapeHTML(product.name)}">
        <button type="button" data-cart-action="decrease" data-id="${escapeHTML(product.id)}" aria-label="Remove half a kilogram of ${escapeHTML(product.name)}">−</button>
        <span>${formatQuantity(quantity)} kg</span>
        <button type="button" data-cart-action="increase" data-id="${escapeHTML(product.id)}" aria-label="Add half a kilogram of ${escapeHTML(product.name)}">+</button>
      </div>`;
    } else {
      action = `<button class="add-button" type="button" data-add="${escapeHTML(product.id)}" aria-label="Add one kilogram of ${escapeHTML(product.name)}">Add 1 kg <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg></button>`;
    }

    return `<article class="product-card${stock ? '' : ' is-unavailable'}" data-category="${escapeHTML(product.category)}">
      <div class="product-photo">
        <span class="stock-pill${stock ? '' : ' out'}">${stockLabel}</span>
        ${imageMarkup(product)}
      </div>
      <div class="product-copy">
        <div class="product-title-row">
          <h4>${escapeHTML(product.name)}</h4>
          <div class="product-price">${price}<small>/ kg</small></div>
        </div>
        <div class="product-tags">${tags.join('')}</div>
        <div class="product-rule"></div>
        <div class="product-card-bottom"><span class="per-kg">Price per kg</span>${action}</div>
      </div>
    </article>`;
  }

  function getFilteredProducts() {
    const searchTerm = query.trim().toLowerCase();
    return products.filter((product) => {
      const categoryMatches = activeCategory === 'all' || product.category === activeCategory;
      const searchable = `${product.name} ${product.local || ''} ${product.detail || ''} ${categoryLabels[product.category] || ''}`.toLowerCase();
      return categoryMatches && (!searchTerm || searchable.includes(searchTerm));
    });
  }

  function renderProducts() {
    const filtered = getFilteredProducts();
    const shown = filtered.slice(0, visibleCount);
    grid.innerHTML = shown.map(productCard).join('');
    grid.hidden = shown.length === 0;
    emptyState.hidden = shown.length !== 0;
    loadMoreButton.hidden = supportsInfiniteScroll || filtered.length <= visibleCount;

    if (filtered.length > visibleCount) {
      const remaining = filtered.length - visibleCount;
      loadMoreButton.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more seafood`;
    }

    if (filtered.length === products.length && activeCategory === 'all' && !query.trim()) {
      resultCount.textContent = `Showing ${Math.min(visibleCount, filtered.length)} of ${filtered.length} seafood options`;
    } else {
      resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'}`;
    }

    $$('[data-filter]').forEach((button) => {
      const isActive = button.dataset.filter === activeCategory;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function basketSummary() {
    const entries = currentCartEntries();
    const lines = entries.length;
    const quantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    const low = entries.reduce((sum, entry) => sum + entry.product.low * entry.quantity, 0);
    const high = entries.reduce((sum, entry) => sum + entry.product.high * entry.quantity, 0);
    return { entries, lines, quantity, low, high, totalLow: low + DELIVERY_CHARGE, totalHigh: high + DELIVERY_CHARGE };
  }

  function updateCartBadge(summary) {
    $('#basket-count').textContent = String(summary.lines);
    $('#drawer-count').textContent = String(summary.lines);
    $('#basket-count').setAttribute('aria-label', `${summary.lines} ${summary.lines === 1 ? 'item' : 'items'} in basket`);
  }

  function renderCart() {
    const summary = basketSummary();
    updateCartBadge(summary);

    const isEmpty = summary.entries.length === 0;
    cartEmpty.hidden = !isEmpty;
    checkoutFields.hidden = isEmpty;
    drawerFooter.hidden = isEmpty;

    if (isEmpty) {
      cartLines.innerHTML = '';
      renderProducts();
      return;
    }

    cartLines.innerHTML = summary.entries.map(({ product, quantity }) => {
      const itemLabel = `${escapeHTML(product.name)}${product.local ? ` <strong>· ${escapeHTML(product.local)}</strong>` : ''}`;
      const rangeLabel = formatPrice(product.low, product.high);
      const lineLow = product.low * quantity;
      const lineHigh = product.high * quantity;
      return `<article class="cart-line">
        <div class="line-photo">${imageMarkup(product)}</div>
        <div class="line-info">
          <h3>${itemLabel}</h3>
          <p>${rangeLabel} / kg${product.detail ? ` · ${escapeHTML(product.detail)}` : ''}</p>
          <div class="cart-quantity" aria-label="Quantity for ${escapeHTML(product.name)}">
            <button type="button" data-cart-action="decrease" data-id="${escapeHTML(product.id)}" aria-label="Remove half a kilogram of ${escapeHTML(product.name)}">−</button>
            <span>${formatQuantity(quantity)} kg</span>
            <button type="button" data-cart-action="increase" data-id="${escapeHTML(product.id)}" aria-label="Add half a kilogram of ${escapeHTML(product.name)}">+</button>
          </div>
        </div>
        <div class="line-total">${formatPrice(lineLow, lineHigh)}</div>
      </article>`;
    }).join('');

    $('#cart-subtotal').textContent = formatPrice(summary.low, summary.high);
    $('#cart-total').textContent = formatPrice(summary.totalLow, summary.totalHigh);
    renderProducts();
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2300);
  }

  function updateQuantity(id, action) {
    const product = getProduct(id);
    if (!product || !product.inStock) return;
    const current = cart.get(id) || 0;
    if (action === 'add') {
      cart.set(id, current > 0 ? current + 0.5 : 1);
      showToast(`${product.name} added to your basket`);
    } else if (action === 'increase') {
      cart.set(id, current + 0.5);
    } else if (action === 'decrease') {
      const next = Math.round((current - 0.5) * 2) / 2;
      if (next <= 0) cart.delete(id);
      else cart.set(id, next);
    } else if (action === 'remove') {
      cart.delete(id);
    }
    saveCart();
    renderCart();
  }

  function openDrawer() {
    renderCart();
    backdrop.hidden = false;
    cartDrawer.classList.add('is-open');
    cartDrawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
    $('#close-cart').focus({ preventScroll: true });
  }

  function closeDrawer() {
    cartDrawer.classList.remove('is-open');
    cartDrawer.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
    document.body.classList.remove('drawer-open');
    $('#open-cart').focus({ preventScroll: true });
  }

  function orderMessage() {
    const summary = basketSummary();
    const name = customerName.value.trim();
    const address = customerAddress.value.trim();
    const itemLines = summary.entries.map(({ product, quantity }) => {
      const productName = product.local ? `${product.name} (${product.local})` : product.name;
      const detail = product.detail ? ` · ${product.detail}` : '';
      return `• ${productName}${detail} — ${formatQuantity(quantity)} kg · PKR ${formatPrice(product.low, product.high).replace('PKR ', '')}/kg`;
    });
    return [
      'Hello Aqua Finatics! I would like to place an order.',
      `Name: ${name}`,
      `Karachi delivery address / area: ${address}`,
      '',
      'My selection:',
      ...itemLines,
      '',
      `Seafood subtotal: ${formatPrice(summary.low, summary.high)}`,
      `Karachi delivery: PKR ${formatNumber(DELIVERY_CHARGE)}`,
      `Order total including delivery: ${formatPrice(summary.totalLow, summary.totalHigh)}`,
      '',
      'Please confirm availability and the 3–5 day delivery timing.',
      'Prices are per kilogram as listed; the three products with supplier-listed price ranges are shown as ranges.',
      'I understand advance payment is required for order confirmation. Please share the bank transfer or JazzCash / Easypaisa payment instructions.'
    ].join('\n');
  }

  function handleCheckout() {
    const summary = basketSummary();
    if (!summary.entries.length) {
      showToast('Add seafood to your basket first');
      return;
    }
    if (!customerName.value.trim()) {
      customerName.setCustomValidity('Please enter your name.');
      customerName.reportValidity();
      customerName.addEventListener('input', () => customerName.setCustomValidity(''), { once: true });
      return;
    }
    if (!customerAddress.value.trim()) {
      customerAddress.setCustomValidity('Please enter your Karachi delivery area or address.');
      customerAddress.reportValidity();
      customerAddress.addEventListener('input', () => customerAddress.setCustomValidity(''), { once: true });
      return;
    }
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(orderMessage())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast('Your order is ready to send on WhatsApp');
  }

  // Search and category filtering
  $$('.filter-tab').forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.filter || 'all';
      visibleCount = PAGE_SIZE;
      renderProducts();
    });
  });

  $$('[data-category-link]').forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.categoryLink || 'all';
      visibleCount = PAGE_SIZE;
      renderProducts();
      document.querySelector('.catalog-controls').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  function syncSearch(value) {
    query = value;
    searchInput.value = value;
    heroSearchInput.value = value;
    visibleCount = PAGE_SIZE;
    renderProducts();
  }

  searchInput.addEventListener('input', () => syncSearch(searchInput.value));
  heroSearchInput.addEventListener('input', () => syncSearch(heroSearchInput.value));
  heroSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    syncSearch(heroSearchInput.value);
    document.querySelector('.catalog-controls').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#clear-search').addEventListener('click', () => {
    syncSearch('');
    searchInput.focus();
  });

  loadMoreButton.addEventListener('click', () => {
    visibleCount += PAGE_SIZE;
    renderProducts();
  });

  // Load the next batch automatically as the visitor nears the end of the list.
  // Keep the manual button only as a fallback for browsers without IntersectionObserver.
  if (supportsInfiniteScroll && loadSentinel) {
    const productLoader = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      const filtered = getFilteredProducts();
      if (visibleCount >= filtered.length) return;
      visibleCount = Math.min(visibleCount + PAGE_SIZE, filtered.length);
      renderProducts();
    }, { rootMargin: '0px 0px 360px 0px' });
    productLoader.observe(loadSentinel);
  }

  // Product cards and basket controls use delegated events so re-rendering is safe.
  grid.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add]');
    if (addButton) {
      updateQuantity(addButton.dataset.add, 'add');
      return;
    }
    const quantityButton = event.target.closest('[data-cart-action]');
    if (quantityButton) updateQuantity(quantityButton.dataset.id, quantityButton.dataset.cartAction);
  });

  cartLines.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cart-action]');
    if (button) updateQuantity(button.dataset.id, button.dataset.cartAction);
  });

  // Basket drawer
  $('#open-cart').addEventListener('click', openDrawer);
  $('#close-cart').addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  $('#continue-shopping').addEventListener('click', closeDrawer);
  $('#send-order').addEventListener('click', handleCheckout);
  customerName.addEventListener('input', () => customerName.setCustomValidity(''));
  customerAddress.addEventListener('input', () => customerAddress.setCustomValidity(''));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && cartDrawer.classList.contains('is-open')) closeDrawer();
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const active = document.activeElement;
      const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      if (!isTyping) {
        event.preventDefault();
        searchInput.focus();
      }
    }
  });

  $('#current-year').textContent = String(new Date().getFullYear());
  readCart();
  renderProducts();
  renderCart();
  loadRemoteCatalog();
})();
