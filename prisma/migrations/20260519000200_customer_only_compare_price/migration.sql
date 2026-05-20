-- Customer-only wishlist and compare-at price support.
ALTER TABLE "WishlistItem" ADD COLUMN "compareAtPrice" TEXT;
ALTER TABLE "WishlistItem" DROP COLUMN "guestId";
ALTER TABLE "WishlistSettings" DROP COLUMN "iconStyle";
ALTER TABLE "WishlistSettings" DROP COLUMN "buttonPosition";
ALTER TABLE "WishlistSettings" DROP COLUMN "primaryColor";
ALTER TABLE "WishlistSettings" DROP COLUMN "iconSize";
ALTER TABLE "WishlistSettings" DROP COLUMN "hoverEffect";
ALTER TABLE "WishlistSettings" DROP COLUMN "guestWishlistEnabled";
