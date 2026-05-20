-- Keep the guest wishlist policy explicit in persisted backend settings.
ALTER TABLE "WishlistSettings" ADD COLUMN "guestWishlistEnabled" BOOLEAN NOT NULL DEFAULT false;
