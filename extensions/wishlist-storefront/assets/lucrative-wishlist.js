(function () {
  if (window.LucrativeWishlistLoaded) return;
  window.LucrativeWishlistLoaded = true;

  const config = window.LucrativeWishlistConfig || {};
  const localItemsKey = "lucrativeWishlistItems";
  const guestIdKey = "lucrativeWishlistGuestId";
  const wishlistColor = "#e11d48";
  const wishlistIconSize = 22;
  const buttonSelector = "[data-lucrative-wishlist-button]";
  const productCardSelectors = [
    ".card-wrapper",
    ".product-card-wrapper",
    "[class*='product-card']",
    "[data-product-card]",
  ];
  const excludedProductAreasSelector = [
    "cart-drawer",
    "cart-items",
    "cart-notification",
    ".cart-drawer",
    ".cart-items",
    ".cart-notification",
    ".drawer",
    ".shopify-section-group-header-group",
    "[id*='CartDrawer']",
    "[id*='cart-drawer']",
    "[data-cart-drawer]",
    "[data-cart-items]",
  ].join(",");

  const state = {
    items: [],
    initialized: false,
    scanScheduled: false,
  };

  function closestProductCard(element) {
    if (element.closest(excludedProductAreasSelector)) return null;

    const candidates = productCardSelectors
      .map((selector) => element.closest(selector))
      .filter(Boolean);
    const bestCard = candidates.find((card) => card.querySelector("img")) || candidates[0];
    return bestCard || null;
  }

  function isProductUrl(url) {
    try {
      return Boolean(new URL(url, window.location.origin).pathname.match(/^\/products\/[^/]+\/?$/));
    } catch (error) {
      return false;
    }
  }

  function hasProductCardSignal(card, productLink) {
    if (!card || !productLink || !isProductUrl(productLink.href)) return false;
    if (card.matches("[data-product-card], [class*='product-card']")) return true;
    if (card.querySelector("[data-product-id], form[action*='/cart/add']")) return true;
    if (card.querySelector(".card__heading, .product-card__title, [data-product-title]")) return true;
    return Boolean(card.querySelector(".price, [class*='price'], [data-sale-price]"));
  }

  function getCardKey(card, productLink) {
    if (!card.dataset.lucrativeWishlistCardKey) {
      const href = productLink?.getAttribute("href") || "";
      card.dataset.lucrativeWishlistCardKey = `${href}-${Math.random().toString(16).slice(2)}`;
    }

    return card.dataset.lucrativeWishlistCardKey;
  }

  function getEndpoint(action) {
    const base = config.apiUrl && config.apiUrl.trim() ? config.apiUrl.trim() : "/apps/wishlist";
    const url = new URL(base, window.location.origin);
    url.searchParams.set("shop", config.shop);
    if (action) url.searchParams.set("action", action);
    return url.toString();
  }

  async function loadRemoteSettings() {
    const response = await fetch(getEndpoint("settings"));
    if (!response.ok) return;
    const data = await response.json();
    if (data.settings && typeof data.settings.wishlistPageVisible === "boolean") {
      config.wishlistPageVisible = data.settings.wishlistPageVisible;
    }
    config.guestWishlistEnabled = data.settings?.guestWishlistEnabled === true;
  }

  function getIdentityParams() {
    if (config.customerId) return { customerId: String(config.customerId) };
    if (config.guestWishlistEnabled) return { guestId: getGuestId() };
    return {};
  }

  function getGuestId() {
    let guestId = localStorage.getItem(guestIdKey);
    if (!guestId) {
      guestId = `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(guestIdKey, guestId);
    }
    return guestId;
  }

  function getLocalItemsKey(identity = getIdentityParams()) {
    if (identity.customerId) return `${localItemsKey}:customer:${identity.customerId}`;
    if (identity.guestId) return `${localItemsKey}:guest:${identity.guestId}`;
    return `${localItemsKey}:anonymous`;
  }

  function readLocalItems(identity) {
    try {
      return JSON.parse(localStorage.getItem(getLocalItemsKey(identity)) || "[]");
    } catch (error) {
      return [];
    }
  }

  function writeLocalItems(items, identity) {
    localStorage.setItem(getLocalItemsKey(identity), JSON.stringify(items));
  }

  function getLoginUrl() {
    const returnUrl = `${window.location.pathname}${window.location.search}`;
    return `/account/login?return_url=${encodeURIComponent(returnUrl)}`;
  }

  function redirectToLogin() {
    window.location.href = getLoginUrl();
  }

  function normalizeProductId(product) {
    return String(product.productId || product.handle || product.url || "");
  }

  function getProductKeys(product) {
    return [product?.productId, product?.handle, product?.url]
      .filter(Boolean)
      .map((value) => String(value));
  }

  function isSameProduct(firstProduct, secondProduct) {
    const firstKeys = new Set(getProductKeys(firstProduct));
    return getProductKeys(secondProduct).some((key) => firstKeys.has(key));
  }

  function isWishlisted(product) {
    return state.items.some((item) => isSameProduct(item, product));
  }

  function removeDuplicateButtons() {
    const buttonsByCard = new Map();
    document.querySelectorAll(buttonSelector).forEach((button) => {
      const card = button.closest(".lucrative-wishlist-card");
      if (!card) return;

      if (buttonsByCard.has(card)) {
        button.remove();
        return;
      }

      buttonsByCard.set(card, button);
    });
  }

  function showToast(message, product) {
    const toastKey = `${message}:${normalizeProductId(product || {})}`;
    const now = Date.now();
    if (showToast.lastKey === toastKey && now - showToast.lastShownAt < 900) return;
    showToast.lastKey = toastKey;
    showToast.lastShownAt = now;

    let toast = document.querySelector("[data-lucrative-wishlist-toast]");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "lucrative-wishlist-toast";
      toast.dataset.lucrativeWishlistToast = "true";
      document.body.appendChild(toast);
    }

    const imageMarkup = product?.image
      ? `<img class='lucrative-wishlist-toast__image' data-lucrative-toast-image='true' alt='${escapeHtml(product.title || "Wishlist product")}' loading='lazy'>`
      : `<div class='lucrative-wishlist-toast__image lucrative-wishlist-toast__image--placeholder'>${getHeartIcon(true)}</div>`;
    toast.innerHTML = `
      ${imageMarkup}
      <div class="lucrative-wishlist-toast__content">
        <p class="lucrative-wishlist-toast__message">${escapeHtml(message)}</p>
        ${product?.title ? `<p class="lucrative-wishlist-toast__title">${escapeHtml(product.title)}</p>` : ""}
        ${renderPriceMarkup(product, "lucrative-wishlist-toast__price")}
      </div>
    `;
    const toastImage = toast.querySelector("[data-lucrative-toast-image]");
    if (toastImage) toastImage.src = product.image;
    toast.classList.add("lucrative-wishlist-toast--visible");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(function () {
      toast.classList.remove("lucrative-wishlist-toast--visible");
    }, 2400);
  }

  function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = value || "";
    return element.innerHTML;
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function cleanPrice(value) {
    return cleanText(value)
      .replace(/regular price/gi, "")
      .replace(/sale price/gi, "")
      .replace(/unit price.*/gi, "")
      .trim();
  }

  function renderPriceMarkup(product, className) {
    if (!product?.price && !product?.compareAtPrice) return "";

    return `<p class="${className}">
      ${product.compareAtPrice ? `<s>${escapeHtml(product.compareAtPrice)}</s>` : ""}
      ${product.price ? `<span>${escapeHtml(product.price)}</span>` : ""}
    </p>`;
  }

  function getProductTitle(element, productLink) {
    const titleElement = element.querySelector(
      ".card__heading a, .card__heading, .product-card__title a, .product-card__title, [data-product-title]",
    );
    const title = cleanText(
      titleElement?.textContent || productLink?.textContent || document.querySelector("h1")?.textContent || "Product",
    );

    return title.split(" Rs.")[0].split(" \u20b9")[0].split(" $")[0].trim() || "Product";
  }

  function getProductPrice(element) {
    const priceElement = element.querySelector(
      ".price-item--sale, .price__sale .price-item, .price-item--regular, .price__regular .price-item, .price .money, [class*='price'] .money, .price",
    );
    const priceText = cleanText(priceElement?.textContent || "");
    const prices = getMoneyValues(priceText);
    if (prices?.length) return prices[prices.length - 1].replace(/\s+/g, " ").trim();

    return cleanPrice(priceText);
  }

  function getMoneyValues(text) {
    return cleanText(text).match(/(?:Rs\.?|\u20b9|\$)\s*[\d,.]+/gi) || [];
  }

  function getProductPricing(element) {
    const saleElement = element.querySelector(
      ".price-item--sale, .price__sale .price-item--sale, [data-sale-price]",
    );
    const regularElement = element.querySelector(
      ".price__sale .price-item--regular, .price-item--regular, [data-compare-price], [data-compare-at-price], [class*='compare'] .money, s .money, .price s",
    );
    const priceElement =
      saleElement ||
      element.querySelector(".price .money, [class*='price'] .money, .price");
    const priceText = cleanText(priceElement?.textContent || "");
    const prices = getMoneyValues(priceText);
    const parsedPrice = prices.length
      ? prices[prices.length - 1].replace(/\s+/g, " ").trim()
      : cleanPrice(priceText);
    const price = parsedPrice || getProductPrice(element);
    const comparePrices = getMoneyValues(regularElement?.textContent || "");
    let compareAtPrice = comparePrices.length
      ? comparePrices[comparePrices.length - 1].replace(/\s+/g, " ").trim()
      : cleanPrice(regularElement?.textContent || "");
    if (!compareAtPrice && !regularElement && prices.length > 1) {
      compareAtPrice = prices[0].replace(/\s+/g, " ").trim();
    }

    return { price, compareAtPrice: compareAtPrice && compareAtPrice !== price ? compareAtPrice : "" };
  }

  function formatMoneyFromCents(cents, fallbackText) {
    if (typeof cents !== "number") return "";
    if (window.Shopify?.formatMoney) {
      const moneyFormat = window.theme?.moneyFormat || window.Shopify.money_format;
      if (moneyFormat) return cleanText(window.Shopify.formatMoney(cents, moneyFormat));
    }

    const fallback = cleanText(fallbackText);
    const prefixMatch = fallback.match(/^(.*?)(?:\d[\d,.]*)/);
    const prefix = prefixMatch?.[1]?.trimEnd() || "Rs.";
    return `${prefix} ${(cents / 100).toFixed(2)}`;
  }

  async function enrichProductPricing(product) {
    if (!product?.handle || product.compareAtPrice) return product;

    try {
      const response = await fetch(`/products/${encodeURIComponent(product.handle)}.js`);
      if (!response.ok) return product;
      const productData = await response.json();
      const variants = productData.variants || [];
      const variant =
        variants.find((candidate) => String(candidate.id) === String(product.variantId)) ||
        variants.find((candidate) => candidate.available) ||
        variants[0];

      if (!variant?.compare_at_price || Number(variant.compare_at_price) <= Number(variant.price)) {
        return product;
      }

      return {
        ...product,
        price: product.price || formatMoneyFromCents(Number(variant.price), product.price),
        compareAtPrice: formatMoneyFromCents(Number(variant.compare_at_price), product.price),
      };
    } catch (error) {
      return product;
    }
  }

  function getHeartIcon(active) {
    const fill = active ? "currentColor" : "none";
    return [
      '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">',
      `<path d="M12 21s-6.7-4.35-9.35-8.44C.45 9.17 2.32 4.5 6.5 4.5c2.13 0 3.55 1.16 4.35 2.28A5.15 5.15 0 0 1 15.2 4.5c4.18 0 6.05 4.67 3.85 8.06C16.7 16.65 12 21 12 21Z" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
      "</svg>",
    ].join("");
  }

  function getRemoveIcon() {
    return [
      '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">',
      '<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      "</svg>",
    ].join("");
  }

  function playLikeAnimation(button) {
    if (!button || button.classList.contains("lucrative-wishlist-button--animating")) return;

    button.classList.add("lucrative-wishlist-button--animating");
    const burst = document.createElement("span");
    burst.className = "lucrative-wishlist-heart-burst";
    burst.innerHTML = getHeartIcon(true);
    button.appendChild(burst);

    window.setTimeout(function () {
      burst.remove();
      button.classList.remove("lucrative-wishlist-button--animating");
    }, 640);
  }

  function productFromElement(element, options = {}) {
    const productLink = element.querySelector('a[href*="/products/"]') || element.closest('a[href*="/products/"]');
    if (options.requireProductLink && (!productLink || !isProductUrl(productLink.href))) return null;

    const href = productLink ? productLink.getAttribute("href") : window.location.pathname;
    const url = href ? new URL(href, window.location.origin).toString() : window.location.href;
    const handleMatch = url.match(/\/products\/([^/?#]+)/);
    const handle = handleMatch ? decodeURIComponent(handleMatch[1]) : "";
    const productId =
      element.dataset.productId ||
      element.querySelector("[data-product-id]")?.dataset.productId ||
      handle;
    const variantId =
      element.querySelector('input[name="id"], select[name="id"]')?.value ||
      document.querySelector('form[action*="/cart/add"] [name="id"]')?.value ||
      "";
    const title = getProductTitle(element, productLink);
    const imageElement = element.querySelector("img") || document.querySelector(".product img, product-info img");
    const image = imageElement?.currentSrc || imageElement?.src || "";
    const { price, compareAtPrice } = getProductPricing(element);

    if (!handle && options.requireProductLink) return null;

    return { productId, variantId, handle, title, image, url, price, compareAtPrice };
  }

  function updateButton(button) {
    const product = JSON.parse(button.dataset.product || "{}");
    const active = isWishlisted(product);
    button.classList.toggle("lucrative-wishlist-button--active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.setAttribute("aria-label", active ? "Remove from wishlist" : "Add to wishlist");
    const nextIcon = getHeartIcon(active);
    if (button.dataset.lucrativeWishlistActive !== String(active)) {
      button.innerHTML = nextIcon;
      button.dataset.lucrativeWishlistActive = String(active);
    }
  }

  function refreshButtons(renderPage) {
    document.querySelectorAll(buttonSelector).forEach(updateButton);
    if (renderPage !== false) renderWishlistPage();
  }

  async function requestWishlist(action, product) {
    const identity = getIdentityParams();
    if (!identity.customerId && !identity.guestId) {
      throw new Error("Customer login is required");
    }

    const response = await fetch(getEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...identity, ...product }),
    });
    if (!response.ok) throw new Error("Wishlist request failed");
    const data = await response.json();
    return data.items || [];
  }

  async function toggleWishlist(product, button) {
    const identity = getIdentityParams();
    if (!identity.customerId && !identity.guestId) {
      showToast("Sign in to use wishlist", product);
      window.setTimeout(redirectToLogin, 450);
      return;
    }

    const active = isWishlisted(product);
    const wishlistProduct = active ? product : await enrichProductPricing(product);
    const previousItems = [...state.items];
    const nextItems = active
      ? state.items.filter((item) => !isSameProduct(item, wishlistProduct))
      : [{ ...wishlistProduct, createdAt: new Date().toISOString() }, ...state.items];

    state.items = nextItems;
    writeLocalItems(nextItems, identity);
    refreshButtons();
    showToast(active ? "Removed from wishlist" : "Added to wishlist", wishlistProduct);
    if (!active) playLikeAnimation(button);
    button.classList.add("lucrative-wishlist-button--loading");

    try {
      const syncedItems = await requestWishlist(active ? "remove" : "add", wishlistProduct);
      if (config.customerId && Array.isArray(syncedItems)) {
        state.items = syncedItems;
        writeLocalItems(syncedItems, identity);
        refreshButtons();
      }
    } catch (error) {
      state.items = previousItems;
      writeLocalItems(previousItems, identity);
      refreshButtons();
      showToast("Wishlist could not be updated. Please try again.", product);
    } finally {
      button.classList.remove("lucrative-wishlist-button--loading");
    }
  }

  function createButton(product, placement) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "lucrative-wishlist-button",
      `lucrative-wishlist-button--${placement || "top-right"}`,
      "lucrative-wishlist-button--hover-scale",
    ].join(" ");
    button.dataset.lucrativeWishlistButton = "true";
    button.dataset.product = JSON.stringify(product);
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleWishlist(product, button);
    });
    updateButton(button);
    return button;
  }

  function injectProductCardButtons() {
    const cards = new Map();
    document.querySelectorAll('a[href*="/products/"]').forEach((productLink) => {
      if (productLink.closest(excludedProductAreasSelector)) return;
      const card = closestProductCard(productLink);
      if (!card || card.querySelector(buttonSelector)) return;
      if (!hasProductCardSignal(card, productLink)) return;
      cards.set(getCardKey(card, productLink), card);
    });

    cards.forEach((card) => {
      const product = productFromElement(card, { requireProductLink: true });
      if (!product) return;
      if (!normalizeProductId(product)) return;
      card.classList.add("lucrative-wishlist-card");
      const button = createButton(product, "top-right");
      card.appendChild(button);
    });
    removeDuplicateButtons();
  }

  function scheduleStorefrontScan() {
    if (state.scanScheduled) return;
    state.scanScheduled = true;

    window.requestAnimationFrame(function () {
      state.scanScheduled = false;
      injectProductCardButtons();
      injectProductDetailButton();
      refreshButtons(false);
    });
  }

  function injectProductDetailButton() {
    const form = document.querySelector('form.form[action*="/cart/add"], form[action*="/cart/add"]');
    if (!form) return;
    const product = productFromElement(form.closest("main") || document.body);
    if (!product) return;
    if (!normalizeProductId(product)) return;
    const button = form.querySelector(buttonSelector) || createButton(product, "pdp");
    button.classList.add("lucrative-wishlist-pdp-button");
    button.dataset.product = JSON.stringify(product);
    const submitButton =
      form.querySelector('button[name="add"], .product-form__submit, [data-add-to-cart]') ||
      Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]')).find(
        (element) => !element.closest(".quantity") && !element.name?.match(/minus|plus/i),
      );
    const formContainer = submitButton?.closest(".form") || form.querySelector(".form") || form.closest(".form") || form;
    if (submitButton) {
      submitButton.insertAdjacentElement("beforebegin", button);
    } else {
      formContainer.appendChild(button);
    }
  }

  function renderWishlistPage() {
    const path = config.wishlistPagePath || "/pages/wishlist";
    if (window.location.pathname.replace(/\/$/, "") !== path.replace(/\/$/, "")) return;
    if (!config.wishlistPageVisible) {
      document.querySelector("[data-lucrative-wishlist-page]")?.remove();
      return;
    }
    let root = document.querySelector("[data-lucrative-wishlist-page]");
    if (!root) {
      root = document.createElement("section");
      root.className = "lucrative-wishlist-page";
      root.dataset.lucrativeWishlistPage = "true";
      const mount = document.querySelector("main") || document.body;
      mount.innerHTML = "";
      mount.appendChild(root);
    }

    if (!state.items.length) {
      root.innerHTML = [
        '<div class="lucrative-wishlist-empty">',
        "<h1>Your wishlist</h1>",
        "<p>Saved products will appear here.</p>",
        "</div>",
      ].join("");
      return;
    }

    root.innerHTML = [
      '<div class="lucrative-wishlist-page__header"><h1>Your wishlist</h1></div>',
      '<div class="lucrative-wishlist-grid">',
      ...state.items
        .map(
          (item) => `
            <article class="lucrative-wishlist-item" data-lucrative-wishlist-item="${escapeHtml(normalizeProductId(item))}">
              <button class="lucrative-wishlist-item__remove" type="button" aria-label="Remove from wishlist" data-lucrative-remove-product="${escapeHtml(normalizeProductId(item))}">
                ${getRemoveIcon()}
              </button>
              <a class="lucrative-wishlist-item__media" data-lucrative-item-link="${escapeHtml(normalizeProductId(item))}">
                ${item.image ? `<img data-lucrative-item-image="${escapeHtml(normalizeProductId(item))}" alt="${escapeHtml(item.title || "Wishlist product")}" loading="lazy">` : ""}
              </a>
              <div class="lucrative-wishlist-item__content">
                <a class="lucrative-wishlist-item__title" data-lucrative-item-link="${escapeHtml(normalizeProductId(item))}">${escapeHtml(item.title || "Product")}</a>
                ${renderPriceMarkup(item, "lucrative-wishlist-item__price")}
              </div>
            </article>`,
        )
        .join(""),
      "</div>",
    ].join("");

    state.items.forEach((item) => {
      const itemKey = normalizeProductId(item);
      root.querySelectorAll("[data-lucrative-item-link]").forEach((link) => {
        if (link.dataset.lucrativeItemLink === itemKey) link.href = item.url || "#";
      });
      root.querySelectorAll("[data-lucrative-item-image]").forEach((image) => {
        if (image.dataset.lucrativeItemImage === itemKey) image.src = item.image || "";
      });
    });

    root.querySelectorAll("[data-lucrative-remove-product]").forEach((button) => {
      button.addEventListener("click", function () {
        const item = state.items.find((candidate) =>
          isSameProduct(candidate, { productId: button.dataset.lucrativeRemoveProduct }),
        );
        if (item) toggleWishlist(item, button);
      });
    });
  }

  async function loadItems() {
    const identity = getIdentityParams();
    state.items = identity.customerId || identity.guestId ? readLocalItems(identity) : [];

    if (!identity.customerId && !identity.guestId) return;

    const url = new URL(getEndpoint("list"));
    Object.entries(identity).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url.toString());
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.items)) {
        state.items = data.items;
        writeLocalItems(data.items, identity);
      }
    }
  }

  function initializeWishlist() {
    if (state.initialized) return;
    state.initialized = true;
    document.documentElement.style.setProperty(
      "--lucrative-wishlist-color",
      wishlistColor,
    );
    document.documentElement.style.setProperty(
      "--lucrative-wishlist-icon-size",
      `${wishlistIconSize}px`,
    );

    loadRemoteSettings()
      .catch(function () {})
      .then(loadItems)
      .catch(function () {})
      .finally(function () {
        injectProductCardButtons();
        injectProductDetailButton();
        refreshButtons(true);

        const observer = new MutationObserver(function (mutations) {
          const shouldScan = mutations.some(function (mutation) {
            const target = mutation.target;
            if (target.closest && target.closest(buttonSelector)) return false;
            return Array.from(mutation.addedNodes).some(function (node) {
              return node.nodeType === Node.ELEMENT_NODE && !node.closest?.(buttonSelector);
            });
          });

          if (shouldScan) scheduleStorefrontScan();
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeWishlist);
  } else {
    initializeWishlist();
  }
})();
