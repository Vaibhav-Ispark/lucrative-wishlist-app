import db from "../db.server";

export const DEFAULT_WISHLIST_SETTINGS = {
  guestWishlistEnabled: false,
  wishlistPageVisible: true,
};

export function getOwnerKey({ customerId, guestId }) {
  if (customerId) return `customer:${customerId}`;
  if (guestId) return `guest:${guestId}`;
  return null;
}

export async function getWishlistSettings(shop) {
  return db.wishlistSettings.upsert({
    where: { shop },
    create: { shop, ...DEFAULT_WISHLIST_SETTINGS },
    update: {},
  });
}

export async function saveWishlistSettings(shop, formData) {
  return db.wishlistSettings.upsert({
    where: { shop },
    create: {
      shop,
      guestWishlistEnabled: formData.get("guestWishlistEnabled") === "on",
      wishlistPageVisible: formData.get("wishlistPageVisible") === "on",
    },
    update: {
      guestWishlistEnabled: formData.get("guestWishlistEnabled") === "on",
      wishlistPageVisible: formData.get("wishlistPageVisible") === "on",
    },
  });
}

export async function listWishlistItems(shop, ownerKey) {
  return db.wishlistItem.findMany({
    where: { shop, ownerKey },
    orderBy: { createdAt: "desc" },
  });
}

function cleanOptionalString(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized || null;
}

function getWishlistItemData(payload) {
  const price = cleanOptionalString(payload.price);
  const compareAtPrice = cleanOptionalString(payload.compareAtPrice);
  const productId = cleanOptionalString(payload.productId) || cleanOptionalString(payload.handle);

  return {
    customerId: cleanOptionalString(payload.customerId),
    productId,
    variantId: cleanOptionalString(payload.variantId),
    handle: cleanOptionalString(payload.handle),
    title: cleanOptionalString(payload.title) || "Untitled product",
    image: cleanOptionalString(payload.image),
    url: cleanOptionalString(payload.url),
    price,
    compareAtPrice: compareAtPrice && compareAtPrice !== price ? compareAtPrice : null,
  };
}

export async function addWishlistItem(shop, ownerKey, payload) {
  const itemData = getWishlistItemData(payload);

  return db.wishlistItem.upsert({
    where: {
      shop_ownerKey_productId: {
        shop,
        ownerKey,
        productId: itemData.productId,
      },
    },
    create: {
      shop,
      ownerKey,
      ...itemData,
    },
    update: itemData,
  });
}

export async function removeWishlistItem(shop, ownerKey, payload) {
  const productId = String(payload.productId || "");
  const handle = payload.handle ? String(payload.handle) : null;
  const url = payload.url ? String(payload.url) : null;
  const matchers = [
    productId ? { productId } : null,
    handle ? { productId: handle } : null,
    handle ? { handle } : null,
    url ? { url } : null,
  ].filter(Boolean);

  if (!matchers.length) return;

  await db.wishlistItem.deleteMany({
    where: {
      shop,
      ownerKey,
      OR: matchers,
    },
  });
}
