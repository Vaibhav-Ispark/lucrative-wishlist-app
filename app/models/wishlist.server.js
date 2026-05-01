import db from "../db.server";

export const DEFAULT_WISHLIST_SETTINGS = {
  iconStyle: "outline",
  customSvg: "",
  buttonPosition: "top-right",
  primaryColor: "#e11d48",
  iconSize: 22,
  hoverEffect: "scale",
  guestWishlistEnabled: true,
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
  const iconSize = Number(formData.get("iconSize"));

  return db.wishlistSettings.upsert({
    where: { shop },
    create: {
      shop,
      iconStyle: String(formData.get("iconStyle") || "outline"),
      customSvg: String(formData.get("customSvg") || ""),
      buttonPosition: String(formData.get("buttonPosition") || "top-right"),
      primaryColor: String(formData.get("primaryColor") || "#e11d48"),
      iconSize: Number.isFinite(iconSize) ? iconSize : 22,
      hoverEffect: String(formData.get("hoverEffect") || "scale"),
      guestWishlistEnabled: formData.get("guestWishlistEnabled") === "on",
      wishlistPageVisible: formData.get("wishlistPageVisible") === "on",
    },
    update: {
      iconStyle: String(formData.get("iconStyle") || "outline"),
      customSvg: String(formData.get("customSvg") || ""),
      buttonPosition: String(formData.get("buttonPosition") || "top-right"),
      primaryColor: String(formData.get("primaryColor") || "#e11d48"),
      iconSize: Number.isFinite(iconSize) ? iconSize : 22,
      hoverEffect: String(formData.get("hoverEffect") || "scale"),
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

export async function addWishlistItem(shop, ownerKey, payload) {
  return db.wishlistItem.upsert({
    where: {
      shop_ownerKey_productId: {
        shop,
        ownerKey,
        productId: String(payload.productId),
      },
    },
    create: {
      shop,
      ownerKey,
      customerId: payload.customerId ? String(payload.customerId) : null,
      guestId: payload.guestId ? String(payload.guestId) : null,
      productId: String(payload.productId),
      variantId: payload.variantId ? String(payload.variantId) : null,
      handle: payload.handle ? String(payload.handle) : null,
      title: String(payload.title || "Untitled product"),
      image: payload.image ? String(payload.image) : null,
      url: payload.url ? String(payload.url) : null,
      price: payload.price ? String(payload.price) : null,
    },
    update: {
      customerId: payload.customerId ? String(payload.customerId) : null,
      guestId: payload.guestId ? String(payload.guestId) : null,
      variantId: payload.variantId ? String(payload.variantId) : null,
      handle: payload.handle ? String(payload.handle) : null,
      title: String(payload.title || "Untitled product"),
      image: payload.image ? String(payload.image) : null,
      url: payload.url ? String(payload.url) : null,
      price: payload.price ? String(payload.price) : null,
    },
  });
}

export async function removeWishlistItem(shop, ownerKey, productId) {
  await db.wishlistItem.deleteMany({
    where: { shop, ownerKey, productId: String(productId) },
  });
}

export async function syncGuestWishlistToCustomer(shop, guestOwnerKey, customerOwnerKey) {
  const guestItems = await db.wishlistItem.findMany({
    where: { shop, ownerKey: guestOwnerKey },
  });

  await Promise.all(
    guestItems.map((item) =>
      db.wishlistItem.upsert({
        where: {
          shop_ownerKey_productId: {
            shop,
            ownerKey: customerOwnerKey,
            productId: item.productId,
          },
        },
        create: {
          shop,
          ownerKey: customerOwnerKey,
          customerId: customerOwnerKey.replace("customer:", ""),
          productId: item.productId,
          variantId: item.variantId,
          handle: item.handle,
          title: item.title,
          image: item.image,
          url: item.url,
          price: item.price,
        },
        update: {
          title: item.title,
          image: item.image,
          url: item.url,
          price: item.price,
        },
      }),
    ),
  );

  await db.wishlistItem.deleteMany({ where: { shop, ownerKey: guestOwnerKey } });
}
