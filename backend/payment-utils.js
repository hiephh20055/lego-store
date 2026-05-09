const crypto = require("crypto");

const TAX_RATE = 0.08;
const SHIPPING_THRESHOLD = 100;
const SHIPPING_COST = 10;
const QR_EXPIRE_MINUTES = 15;

function toMoney(n) {
  return Number(Number(n || 0).toFixed(2));
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      productId: String(it.productId ?? it.id ?? "").trim(),
      qty: Number(it.qty || 0),
    }))
    .filter((it) => it.productId && Number.isFinite(it.qty) && it.qty > 0);
}

function calcTotals(orderItems) {
  const subtotal = toMoney(
    orderItems.reduce((sum, it) => {
      return sum + Number(it.price) * Number(it.qty);
    }, 0)
  );
  const tax = toMoney(subtotal * TAX_RATE);
  const shipping = subtotal > SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const total = toMoney(subtotal + tax + shipping);
  return { subtotal, tax, shipping: toMoney(shipping), total };
}

function addMinutesIso(minutes) {
  const d = new Date(Date.now() + minutes * 60 * 1000);
  return d.toISOString();
}

function randomRef(prefix) {
  return prefix + "-" + crypto.randomBytes(6).toString("hex");
}

function generateQrPayload(data) {
  const payload = {
    provider: "mock_qr",
    order_id: data.orderId,
    tx_ref: data.txRef,
    amount: toMoney(data.amount),
    currency: "USD",
    expires_at: data.expiresAt,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function generateQrData(orderId, amount) {
  const txRef = randomRef("TX");
  const expiresAt = addMinutesIso(QR_EXPIRE_MINUTES);
  const qrPayload = generateQrPayload({ orderId, txRef, amount, expiresAt });
  const qrText = "playarena://pay?payload=" + encodeURIComponent(qrPayload);
  return { txRef, expiresAt, qrPayload, qrText };
}

module.exports = {
  normalizeItems,
  calcTotals,
  generateQrData,
  QR_EXPIRE_MINUTES,
};
