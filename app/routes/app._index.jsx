import { useEffect } from "react";
import { Form, Link, useActionData, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import dashboardStyles from "../styles/wishlist-admin.css?url";
import {
  getWishlistSettings,
  saveWishlistSettings,
} from "../models/wishlist.server";

export const links = () => [{ rel: "stylesheet", href: dashboardStyles }];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const productFilter = url.searchParams.get("product") || "";
  const customerFilter = url.searchParams.get("customer") || "";
  const dateFilter = url.searchParams.get("date") || "";
  const preservedSearchParams = Array.from(url.searchParams.entries()).filter(
    ([key]) => !["product", "customer", "date"].includes(key),
  );
  const where = {
    shop,
    ...(productFilter
      ? { title: { contains: productFilter } }
      : {}),
    ...(customerFilter
      ? { ownerKey: { contains: customerFilter } }
      : {}),
    ...(dateFilter
      ? { createdAt: { gte: new Date(`${dateFilter}T00:00:00.000Z`) } }
      : {}),
  };

  const [settings, totalItems, recentItems, mostWishlisted, customerActivity] =
    await Promise.all([
      getWishlistSettings(shop),
      db.wishlistItem.count({ where: { shop } }),
      db.wishlistItem.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.wishlistItem.groupBy({
        by: ["productId", "title"],
        where: { shop },
        _count: { productId: true },
        orderBy: { _count: { productId: "desc" } },
        take: 5,
      }),
      db.wishlistItem.groupBy({
        by: ["ownerKey"],
        where: { shop },
        _count: { ownerKey: true },
        orderBy: { _count: { ownerKey: "desc" } },
        take: 5,
      }),
    ]);

  return {
    filters: { productFilter, customerFilter, dateFilter },
    preservedSearchParams,
    settings,
    shop,
    totalItems,
    recentItems,
    mostWishlisted,
    customerActivity,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const settings = await saveWishlistSettings(session.shop, formData);

  return { saved: true, settings };
};

function formatOwner(ownerKey) {
  if (!ownerKey) return "Unknown";
  return ownerKey.replace("customer:", "Customer ").replace("guest:", "Guest ");
}

function HiddenEmbeddedParams({ params }) {
  return params.map(([key, value]) => (
    <input key={`${key}-${value}`} name={key} type="hidden" value={value} />
  ));
}

export default function Dashboard() {
  const {
    customerActivity,
    filters,
    mostWishlisted,
    recentItems,
    preservedSearchParams,
    settings,
    shop,
    totalItems,
  } = useLoaderData();
  const actionData = useActionData();
  const shopify = useAppBridge();
  const clearFiltersUrl = `/app${
    preservedSearchParams.length
      ? `?${new URLSearchParams(preservedSearchParams).toString()}`
      : ""
  }`;

  useEffect(() => {
    if (actionData?.saved) {
      shopify.toast.show("Wishlist settings saved");
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="Wishlist">
      <s-button slot="primary-action" href="/app/export">
        Export CSV
      </s-button>

      <s-section>
        <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Total wishlist items</s-heading>
            <s-text type="strong">{totalItems}</s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Top product</s-heading>
            <s-text type="strong">
              {mostWishlisted[0]?.title || "No products yet"}
            </s-text>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>Active shoppers</s-heading>
            <s-text type="strong">{customerActivity.length}</s-text>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Most wishlisted products">
        <s-stack gap="base">
          {mostWishlisted.length ? (
            mostWishlisted.map((product) => (
              <s-box
                key={product.productId}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="inline" justifyContent="space-between">
                  <s-text>{product.title}</s-text>
                  <s-badge>{product._count.productId} saves</s-badge>
                </s-stack>
              </s-box>
            ))
          ) : (
            <s-text>No wishlist activity has been recorded yet.</s-text>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Wishlist activity">
        <Form className="wishlist-admin-filter-form" method="get">
          <HiddenEmbeddedParams params={preservedSearchParams} />
          <label className="wishlist-admin-field">
            <span>Product</span>
            <input
              name="product"
              defaultValue={filters.productFilter}
              placeholder="Search product title"
            />
          </label>
          <label className="wishlist-admin-field">
            <span>Customer or guest</span>
            <input
              name="customer"
              defaultValue={filters.customerFilter}
              placeholder="customer: or guest:"
            />
          </label>
          <label className="wishlist-admin-field">
            <span>From date</span>
            <input
              type="date"
              name="date"
              defaultValue={filters.dateFilter}
            />
          </label>
          <div className="wishlist-admin-form-actions">
            <button className="wishlist-admin-button" type="submit">
              Filter
            </button>
            <Link className="wishlist-admin-secondary-button" to={clearFiltersUrl}>
              Clear
            </Link>
          </div>
        </Form>

        <s-table>
          <s-table-header-row>
            <s-table-header>Product</s-table-header>
            <s-table-header>Customer</s-table-header>
            <s-table-header>Price</s-table-header>
            <s-table-header>Compare at</s-table-header>
            <s-table-header>Date</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {recentItems.map((item) => (
              <s-table-row key={item.id}>
                <s-table-cell>{item.title}</s-table-cell>
                <s-table-cell>{formatOwner(item.ownerKey)}</s-table-cell>
                <s-table-cell>{item.price || "N/A"}</s-table-cell>
                <s-table-cell>{item.compareAtPrice || "N/A"}</s-table-cell>
                <s-table-cell>
                  {new Date(item.createdAt).toLocaleDateString()}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Wishlist page settings">
        <Form className="wishlist-admin-settings-form" method="post">
          <HiddenEmbeddedParams params={preservedSearchParams} />
          <label className="wishlist-admin-toggle">
            <input
              name="guestWishlistEnabled"
              type="checkbox"
              defaultChecked={settings.guestWishlistEnabled}
            />
            <span>Allow guests to wishlist products</span>
          </label>
          <label className="wishlist-admin-toggle">
            <input
              name="wishlistPageVisible"
              type="checkbox"
              defaultChecked={settings.wishlistPageVisible}
            />
            <span>Show wishlist page renderer</span>
          </label>
          <div className="wishlist-admin-form-actions wishlist-admin-form-actions--wide">
            <button className="wishlist-admin-button" type="submit">
              Save settings
            </button>
          </div>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Theme setup">
        <s-paragraph>
          Enable the Wishlist app embed in the theme customizer. If app proxy is
          not configured, set the embed API URL to this app&apos;s public URL.
        </s-paragraph>
        <s-paragraph>
          Shop: <s-text type="strong">{shop}</s-text>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
