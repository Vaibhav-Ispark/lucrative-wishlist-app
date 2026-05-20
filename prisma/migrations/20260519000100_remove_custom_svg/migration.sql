-- Drop custom SVG setting after removing custom icon uploads from the app.
ALTER TABLE "WishlistSettings" DROP COLUMN "customSvg";
