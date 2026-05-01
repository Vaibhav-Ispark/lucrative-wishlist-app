-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "customerId" TEXT,
    "guestId" TEXT,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "handle" TEXT,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "url" TEXT,
    "price" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WishlistSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "iconStyle" TEXT NOT NULL DEFAULT 'outline',
    "customSvg" TEXT,
    "buttonPosition" TEXT NOT NULL DEFAULT 'top-right',
    "primaryColor" TEXT NOT NULL DEFAULT '#e11d48',
    "iconSize" INTEGER NOT NULL DEFAULT 22,
    "hoverEffect" TEXT NOT NULL DEFAULT 'scale',
    "guestWishlistEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wishlistPageVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "WishlistItem_shop_createdAt_idx" ON "WishlistItem"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "WishlistItem_shop_productId_idx" ON "WishlistItem"("shop", "productId");

-- CreateIndex
CREATE INDEX "WishlistItem_shop_customerId_idx" ON "WishlistItem"("shop", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_shop_ownerKey_productId_key" ON "WishlistItem"("shop", "ownerKey", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistSettings_shop_key" ON "WishlistSettings"("shop");
