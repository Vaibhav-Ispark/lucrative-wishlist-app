import {
  addWishlistItem,
  getOwnerKey,
  getWishlistSettings,
  listWishlistItems,
  removeWishlistItem,
  syncGuestWishlistToCustomer,
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

  const ownerKey = getOwnerKey({
    customerId: url.searchParams.get("customerId"),
    guestId: url.searchParams.get("guestId"),
  });

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
  const ownerKey = getOwnerKey(payload);

  if (!ownerKey) {
    return json({ error: "Wishlist owner is required." }, { status: 400 });
  }

  if (payload.action === "sync" && payload.customerId && payload.guestId) {
    await syncGuestWishlistToCustomer(
      shop,
      getOwnerKey({ guestId: payload.guestId }),
      getOwnerKey({ customerId: payload.customerId }),
    );
    const items = await listWishlistItems(shop, getOwnerKey({ customerId: payload.customerId }));
    return json({ items });
  }

  if (payload.action === "remove") {
    await removeWishlistItem(shop, ownerKey, payload.productId);
  }

  if (payload.action === "add") {
    await addWishlistItem(shop, ownerKey, payload);
  }

  const items = await listWishlistItems(shop, ownerKey);
  return json({ items });
};
