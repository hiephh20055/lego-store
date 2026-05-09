/**
 * Wishlist — shared across cart / products / cart page
 * localStorage key: wishlist — array of { id, name, price, img }
 */
const WISHLIST_KEY = "wishlist";

function getWishlist() {
  try {
    return JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveWishlist(list) {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));
}

function isWishlisted(productId) {
  const id = String(productId);
  return getWishlist().some(function (x) {
    return String(x.id) === id;
  });
}

/** Returns true if added to wishlist, false if removed */
function toggleWishlist(product) {
  const list = getWishlist();
  const id = String(product.id);
  const idx = list.findIndex(function (x) {
    return String(x.id) === id;
  });
  if (idx >= 0) {
    list.splice(idx, 1);
    saveWishlist(list);
    window.dispatchEvent(new CustomEvent("wishlistchange"));
    return false;
  }
  list.push({
    id: product.id,
    name: product.name,
    price: Number(product.price),
    img: product.img || product.image_url || "",
  });
  saveWishlist(list);
  window.dispatchEvent(new CustomEvent("wishlistchange"));
  return true;
}

function removeFromWishlist(productId) {
  const id = String(productId);
  const list = getWishlist().filter(function (x) {
    return String(x.id) !== id;
  });
  saveWishlist(list);
  window.dispatchEvent(new CustomEvent("wishlistchange"));
}
