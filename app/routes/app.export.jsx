import db from "../db.server";
import { authenticate } from "../shopify.server";

function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const items = await db.wishlistItem.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });
  const rows = [
    [
      "Product",
      "Product ID",
      "Variant ID",
      "Owner",
      "Price",
      "Compare at price",
      "URL",
      "Created at",
    ],
    ...items.map((item) => [
      item.title,
      item.productId,
      item.variantId,
      item.ownerKey,
      item.price,
      item.compareAtPrice,
      item.url,
      item.createdAt.toISOString(),
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="wishlist-export.csv"',
    },
  });
};
