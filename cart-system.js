/**
 * Giỏ hàng — một nguồn dữ liệu trong closure, tránh trùng `let cart` với script khác trên cùng trang.
 * API: window.addToCart, window.updateCartBadge, window.reloadCartFromStorage
 */
(function () {
  "use strict";

  var cart = JSON.parse(localStorage.getItem("cart") || "[]") || [];

  function persist() {
    localStorage.setItem("cart", JSON.stringify(cart));
  }

  function reloadFromStorage() {
    cart = JSON.parse(localStorage.getItem("cart") || "[]") || [];
  }

  window.reloadCartFromStorage = function () {
    reloadFromStorage();
  };

  window.addToCart = function (product) {
    if (!product || product.id === undefined || product.id === null) return;
    var qty = Number(product.qty) > 0 ? Number(product.qty) : 1;
    var exist = cart.find(function (p) {
      return String(p.id) === String(product.id);
    });
    if (exist) {
      exist.qty += qty;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        img: product.img,
        qty: qty,
      });
    }
    persist();
    window.updateCartBadge();
  };

  window.updateCartBadge = function () {
    reloadFromStorage();
    var cartBadge = document.querySelector(".cart-count");
    if (!cartBadge) return;
    var total = cart.reduce(function (sum, item) {
      return sum + (item.qty || 1);
    }, 0);
    cartBadge.innerText = total;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      window.updateCartBadge();
    });
  } else {
    window.updateCartBadge();
  }
})();
