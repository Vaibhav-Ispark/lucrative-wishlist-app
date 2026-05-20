import {
  addWishlistItem,
  getOwnerKey,
  getWishlistSettings,
  listWishlistItems,
  removeWishlistItem,
} from "../models/wishlist.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...corsHeaders, ...(init.headers || {}) },
  });
}

function getShop(request) {
  const url = new URL(request.url);
  return url.searchParams.get("shop");
}

function isProductPayload(payload) {
  const productId = String(payload.productId || "");
  const handle = String(payload.handle || "");
  const url = String(payload.url || "");

  return Boolean(productId && (handle || url.includes("/products/")));
}

function getWishlistOwner(payload, settings) {
  const ownerKey = getOwnerKey({
    customerId: payload.customerId,
    guestId: settings.guestWishlistEnabled ? payload.guestId : null,
  });

  return ownerKey;
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = getShop(request);
  const action = url.searchParams.get("action") || "list";

  if (!shop) {
    return json({ error: "Missing shop parameter." }, { status: 400 });
  }

  if (action === "settings") {
    const settings = await getWishlistSettings(shop);
    return json({ settings });
  }

  const settings = await getWishlistSettings(shop);

  const ownerKey = getWishlistOwner({
    customerId: url.searchParams.get("customerId"),
    guestId: url.searchParams.get("guestId"),
  }, settings);

  if (!ownerKey) {
    return json({ items: [] });
  }

  const items = await listWishlistItems(shop, ownerKey);
  return json({ items });
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const shop = getShop(request);
  if (!shop) {
    return json({ error: "Missing shop parameter." }, { status: 400 });
  }

  const payload = await request.json();
  const settings = await getWishlistSettings(shop);
  const ownerKey = getWishlistOwner(payload, settings);

  if (!ownerKey) {
    return json(
      { error: settings.guestWishlistEnabled ? "Wishlist owner is required." : "Customer login is required." },
      { status: 401 },
    );
  }

  if (payload.action === "remove") {
    await removeWishlistItem(shop, ownerKey, payload);
  }

  if (payload.action === "add") {
    if (!isProductPayload(payload)) {
      return json({ error: "Only products can be wishlisted." }, { status: 400 });
    }

    await addWishlistItem(shop, ownerKey, payload);
  }

  const items = await listWishlistItems(shop, ownerKey);
  return json({ items });
};
