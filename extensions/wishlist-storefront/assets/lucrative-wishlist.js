(function () {
  const config = window.LucrativeWishlistConfig || {};
  const storageKey = "lucrativeWishlistGuestId";
  const localItemsKey = "lucrativeWishlistItems";
  const movedToCartKey = "lucrativeWishlistMovedToCartItems";
  const buttonSelector = "[data-lucrative-wishlist-button]";
  const productCardSelectors = [
    ".card-wrapper",
    ".product-card-wrapper",
    ".grid__item",
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
    cartMonitorStarted: false,
  };

  function closestProductCard(element) {
    if (element.closest(excludedProductAreasSelector)) return null;

    const candidates = productCardSelectors
      .map((selector) => element.closest(selector))
      .filter(Boolean);
    const bestCard = candidates.find((card) => card.querySelector("img")) || candidates[0];
    if (bestCard) return bestCard;

    return element.closest("li, article") || element.parentElement;
  }

  function getCardKey(card, productLink) {
    if (!card.dataset.lucrativeWishlistCardKey) {
      const href = productLink?.getAttribute("href") || "";
      card.dataset.lucrativeWishlistCardKey = `${href}-${Math.random().toString(16).slice(2)}`;
    }

    return card.dataset.lucrativeWishlistCardKey;
  }

  function getGuestId() {
    let guestId = localStorage.getItem(storageKey);
    if (!guestId) {
      guestId = `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(storageKey, guestId);
    }
    return guestId;
  }

  function getEndpoint(action) {
    const base = config.apiUrl && config.apiUrl.trim() ? config.apiUrl.trim() : "/apps/wishlist";
    const url = new URL(base, window.location.origin);
    url.searchParams.set("shop", config.shop);
    if (action) url.searchParams.set("action", action);
    return url.toString();
  }

  function getIdentityParams() {
    if (config.customerId) return { customerId: String(config.customerId) };
    if (config.guestWishlistEnabled === false) return {};
    return { guestId: getGuestId() };
  }

  function readLocalItems() {
    try {
      return JSON.parse(localStorage.getItem(localItemsKey) || "[]");
    } catch (error) {
      return [];
    }
  }

  function writeLocalItems(items) {
    localStorage.setItem(localItemsKey, JSON.stringify(items));
  }

  function readMovedToCartItems() {
    try {
      return JSON.parse(localStorage.getItem(movedToCartKey) || "[]");
    } catch (error) {
      return [];
    }
  }

  function writeMovedToCartItems(items) {
    localStorage.setItem(movedToCartKey, JSON.stringify(items));
  }

  function normalizeProductId(product) {
    return String(product.productId || product.handle || product.url || "");
  }

  function isWishlisted(productId) {
    return state.items.some((item) => normalizeProductId(item) === String(productId));
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
    let toast = document.querySelector("[data-lucrative-wishlist-toast]");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "lucrative-wishlist-toast";
      toast.dataset.lucrativeWishlistToast = "true";
      document.body.appendChild(toast);
    }

    const imageMarkup = product?.image
      ? `<img class="lucrative-wishlist-toast__image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title || "Wishlist product")}" loading="lazy">`
      : `<div class="lucrative-wishlist-toast__image lucrative-wishlist-toast__image--placeholder">${getHeartIcon(true)}</div>`;
    toast.innerHTML = `
      ${imageMarkup}
      <div class="lucrative-wishlist-toast__content">
        <p class="lucrative-wishlist-toast__message">${escapeHtml(message)}</p>
        ${product?.title ? `<p class="lucrative-wishlist-toast__title">${escapeHtml(product.title)}</p>` : ""}
        ${product?.price ? `<p class="lucrative-wishlist-toast__price">${escapeHtml(product.price)}</p>` : ""}
      </div>
    `;
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

  function getHeartIcon(active) {
    if (config.iconStyle === "custom" && config.customSvg) return config.customSvg;
    const fill = active || config.iconStyle === "filled" ? "currentColor" : "none";
    return [
      '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">',
      `<path d="M12 21s-6.7-4.35-9.35-8.44C.45 9.17 2.32 4.5 6.5 4.5c2.13 0 3.55 1.16 4.35 2.28A5.15 5.15 0 0 1 15.2 4.5c4.18 0 6.05 4.67 3.85 8.06C16.7 16.65 12 21 12 21Z" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
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

  function productFromElement(element) {
    const productLink = element.querySelector('a[href*="/products/"]') || element.closest('a[href*="/products/"]');
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
    const title =
      element.querySelector(".card__heading, .product-card__title, [class*='title']")?.textContent?.trim() ||
      productLink?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      "Product";
    const imageElement = element.querySelector("img") || document.querySelector(".product img, product-info img");
    const image = imageElement?.currentSrc || imageElement?.src || "";
    const price =
      element.querySelector(".price, [class*='price']")?.textContent?.trim() ||
      document.querySelector(".price, [class*='price']")?.textContent?.trim() ||
      "";

    return { productId, variantId, handle, title, image, url, price };
  }

  function updateButton(button) {
    const product = JSON.parse(button.dataset.product || "{}");
    const active = isWishlisted(normalizeProductId(product));
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
    if (!identity.customerId && !identity.guestId) return readLocalItems();

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
    const productId = normalizeProductId(product);
    const active = isWishlisted(productId);
    const previousItems = [...state.items];
    const nextItems = active
      ? state.items.filter((item) => normalizeProductId(item) !== productId)
      : [{ ...product, createdAt: new Date().toISOString() }, ...state.items];

    state.items = nextItems;
    writeLocalItems(nextItems);
    refreshButtons();
    showToast(active ? "Removed from wishlist" : "Added to wishlist", product);
    if (!active) playLikeAnimation(button);
    button.classList.add("lucrative-wishlist-button--loading");

    try {
      const syncedItems = await requestWishlist(active ? "remove" : "add", product);
      if (config.customerId && Array.isArray(syncedItems)) {
        state.items = syncedItems;
        refreshButtons();
      }
    } catch (error) {
      state.items = previousItems;
      writeLocalItems(previousItems);
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
      `lucrative-wishlist-button--${placement || config.buttonPosition || "top-right"}`,
      `lucrative-wishlist-button--hover-${config.hoverEffect || "scale"}`,
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
      cards.set(getCardKey(card, productLink), card);
    });

    cards.forEach((card) => {
      const product = productFromElement(card);
      if (!normalizeProductId(product)) return;
      card.classList.add("lucrative-wishlist-card");
      const button = createButton(product, config.buttonPosition || "top-right");
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
    const form = document.querySelector('form[action*="/cart/add"]');
    if (!form || form.querySelector(buttonSelector)) return;
    const product = productFromElement(form.closest("main") || document.body);
    if (!normalizeProductId(product)) return;
    const button = createButton(product, "pdp");
    button.classList.add("lucrative-wishlist-pdp-button");
    const submitButton = form.querySelector('[type="submit"], button[name="add"]');
    if (submitButton) {
      submitButton.insertAdjacentElement("afterend", button);
    } else {
      form.appendChild(button);
    }
  }

  function renderWishlistPage() {
    if (!config.wishlistPageVisible) return;
    const path = config.wishlistPagePath || "/pages/wishlist";
    if (window.location.pathname.replace(/\/$/, "") !== path.replace(/\/$/, "")) return;
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
            <article class="lucrative-wishlist-item">
              <a class="lucrative-wishlist-item__media" href="${item.url || "#"}">
                ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title || "Wishlist product")}" loading="lazy">` : ""}
              </a>
              <div class="lucrative-wishlist-item__content">
                <a class="lucrative-wishlist-item__title" href="${escapeHtml(item.url || "#")}">${escapeHtml(item.title || "Product")}</a>
                <p class="lucrative-wishlist-item__price">${escapeHtml(item.price || "")}</p>
                <div class="lucrative-wishlist-item__actions">
                  <button class="lucrative-wishlist-action" data-lucrative-add-to-cart-product="${escapeHtml(normalizeProductId(item))}">Add to cart</button>
                  <button class="lucrative-wishlist-action lucrative-wishlist-action--secondary" data-lucrative-remove-product="${normalizeProductId(item)}">Remove</button>
                </div>
              </div>
            </article>`,
        )
        .join(""),
      "</div>",
    ].join("");

    root.querySelectorAll("[data-lucrative-remove-product]").forEach((button) => {
      button.addEventListener("click", function () {
        const item = state.items.find(
          (candidate) => normalizeProductId(candidate) === button.dataset.lucrativeRemoveProduct,
        );
        if (item) toggleWishlist(item, button);
      });
    });

    root.querySelectorAll("[data-lucrative-add-to-cart-product]").forEach((button) => {
      button.addEventListener("click", async function () {
        const item = state.items.find(
          (candidate) => normalizeProductId(candidate) === button.dataset.lucrativeAddToCartProduct,
        );
        if (item) await addWishlistItemToCart(item, button);
      });
    });
  }

  async function getVariantIdForCart(item) {
    if (item.variantId) return item.variantId;
    if (!item.handle) return null;

    const response = await fetch(`/products/${item.handle}.js`);
    if (!response.ok) return null;
    const product = await response.json();
    const variant = product.variants?.find((candidate) => candidate.available) || product.variants?.[0];
    return variant ? String(variant.id) : null;
  }

  async function getCart() {
    const response = await fetch("/cart.js");
    if (!response.ok) return null;
    return response.json();
  }

  function updateCartCount(cart) {
    if (!cart) return;
    const count = String(cart.item_count || 0);
    document.querySelectorAll(
      ".cart-count-bubble span:first-child, .cart-count-bubble, [data-cart-count], [data-cart-count-bubble]",
    ).forEach((element) => {
      element.textContent = count;
      element.classList.toggle("hidden", count === "0");
    });
  }

  async function refreshHorizonCartUi(cart) {
    updateCartCount(cart);
    document.documentElement.dispatchEvent(
      new CustomEvent("cart:refresh", { bubbles: true, detail: { cart } }),
    );
    document.documentElement.dispatchEvent(
      new CustomEvent("cart:update", { bubbles: true, detail: { cart } }),
    );
    document.dispatchEvent(new CustomEvent("cart:updated", { detail: { cart } }));
    window.dispatchEvent(new CustomEvent("cart:updated", { detail: { cart } }));

    try {
      const sections = ["cart-drawer", "cart-icon-bubble", "cart-notification-product"];
      const response = await fetch(`/?sections=${sections.join(",")}`);
      if (!response.ok) return;
      const htmlBySection = await response.json();
      Object.entries(htmlBySection).forEach(([sectionId, html]) => {
        if (!html) return;
        const parsed = new DOMParser().parseFromString(html, "text/html");
        const currentSection =
          document.getElementById(`shopify-section-${sectionId}`) ||
          document.querySelector(`#${sectionId}, ${sectionId}`);
        const nextSection =
          parsed.getElementById(`shopify-section-${sectionId}`) ||
          parsed.querySelector(`#${sectionId}, ${sectionId}`);

        if (currentSection && nextSection) {
          currentSection.innerHTML = nextSection.innerHTML;
        }
      });
    } catch (error) {
      // Theme section rendering is best-effort; cart.js has already updated.
    }
  }

  async function addWishlistItemToCart(item, button) {
    button.classList.add("lucrative-wishlist-action--loading");
    button.textContent = "Adding...";

    try {
      const variantId = await getVariantIdForCart(item);
      if (!variantId) throw new Error("No variant available");

      const response = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: variantId, quantity: 1 }),
      });
      if (!response.ok) throw new Error("Cart add failed");
      const cart = await getCart();

      const productWithVariant = { ...item, variantId };
      const movedItems = readMovedToCartItems().filter(
        (movedItem) => normalizeProductId(movedItem) !== normalizeProductId(item),
      );
      movedItems.push(productWithVariant);
      writeMovedToCartItems(movedItems);

      await toggleWishlist(productWithVariant, button);
      await refreshHorizonCartUi(cart);
      showToast("Added to cart and removed from wishlist", productWithVariant);
      startCartMonitor();
    } catch (error) {
      showToast("Could not add this item to cart.", item);
    } finally {
      button.classList.remove("lucrative-wishlist-action--loading");
      button.textContent = "Add to cart";
    }
  }

  async function restoreRemovedCartItems() {
    const movedItems = readMovedToCartItems();
    if (!movedItems.length) return;

    const cart = await getCart();
    if (!cart) return;
    const cartVariantIds = new Set((cart.items || []).map((item) => String(item.variant_id)));
    const stillInCart = [];
    let restored = false;

    movedItems.forEach((item) => {
      if (item.variantId && cartVariantIds.has(String(item.variantId))) {
        stillInCart.push(item);
        return;
      }

      if (!isWishlisted(normalizeProductId(item))) {
        state.items = [{ ...item, createdAt: new Date().toISOString() }, ...state.items];
        requestWishlist("add", item).catch(function () {});
        restored = true;
      }
    });

    writeMovedToCartItems(stillInCart);
    if (restored) {
      writeLocalItems(state.items);
      refreshButtons();
      showToast("Removed cart item was added back to wishlist", state.items[0]);
    }
  }

  function startCartMonitor() {
    if (state.cartMonitorStarted) return;
    state.cartMonitorStarted = true;
    restoreRemovedCartItems().catch(function () {});
    window.setInterval(function () {
      restoreRemovedCartItems().catch(function () {});
    }, 6000);
    window.addEventListener("focus", function () {
      restoreRemovedCartItems().catch(function () {});
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) restoreRemovedCartItems().catch(function () {});
    });
  }

  async function loadItems() {
    const identity = getIdentityParams();
    state.items = readLocalItems();

    if (config.customerId && localStorage.getItem(storageKey)) {
      await requestWishlist("sync", { guestId: localStorage.getItem(storageKey) }).then((items) => {
        state.items = items;
        writeLocalItems([]);
      });
      return;
    }

    if (!identity.customerId && !identity.guestId) return;

    const url = new URL(getEndpoint("list"));
    Object.entries(identity).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url.toString());
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.items)) state.items = data.items.length ? data.items : state.items;
    }
  }

  function initializeWishlist() {
    if (state.initialized) return;
    state.initialized = true;
    document.documentElement.style.setProperty(
      "--lucrative-wishlist-color",
      config.primaryColor || "#e11d48",
    );
    document.documentElement.style.setProperty(
      "--lucrative-wishlist-icon-size",
      `${config.iconSize || 22}px`,
    );

    loadItems()
      .catch(function () {})
      .finally(function () {
        injectProductCardButtons();
        injectProductDetailButton();
        refreshButtons(true);
        startCartMonitor();

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
