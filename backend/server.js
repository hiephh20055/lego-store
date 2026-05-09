const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { normalizeItems, calcTotals, generateQrData } = require("./payment-utils");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

const SECRET = "supersecretkey";
const DEFAULT_ADMIN_EMAIL = "admin@playarena.local";
const DEFAULT_ADMIN_PASSWORD = "Admin123!";
const dbPath = path.join(__dirname, "users.db");
const legacyDbPath = path.join(__dirname, "..", "users.db");
const db = new sqlite3.Database(dbPath);
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      cb(null, "set-" + Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
    },
  }),
  fileFilter: function (req, file, cb) {
    if (!String(file.mimetype || "").startsWith("image/")) {
      cb(new Error("Only image uploads are allowed"));
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

function runAsync(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params || [], function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params || [], function (err, row) {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function allAsync(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params || [], function (err, rows) {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

db.serialize(() => {
  db.run(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password TEXT,
  role TEXT DEFAULT "user"
)
`);
  db.run(`
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  image_url TEXT,
  age_min INTEGER,
  pieces INTEGER,
  theme TEXT,
  stock INTEGER DEFAULT 100,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`);
  db.run(`ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 100`, () => {});
  db.run(`
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  subtotal REAL NOT NULL,
  tax REAL NOT NULL,
  shipping REAL NOT NULL,
  total REAL NOT NULL,
  status TEXT DEFAULT 'pending'
)
`);
  db.run(`
CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id TEXT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  qty INTEGER NOT NULL,
  image_url TEXT
)
`);
  db.run(`
CREATE TABLE IF NOT EXISTS payment_transactions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  tx_ref TEXT UNIQUE,
  method TEXT DEFAULT 'qr',
  amount REAL NOT NULL,
  qr_payload TEXT,
  qr_text TEXT,
  qr_expires_at TEXT,
  status TEXT DEFAULT 'pending',
  paid_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`);
});

function ensureProductsColumns() {
  db.all("PRAGMA table_info(products)", [], function (err, cols) {
    if (err || !Array.isArray(cols)) return;
    const names = cols.map((c) => c.name);
    if (!names.includes("stock")) {
      db.run("ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 100", () => {});
    }
    if (!names.includes("created_at")) {
      db.run("ALTER TABLE products ADD COLUMN created_at TEXT", () => {});
    }
    db.run("UPDATE products SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL", () => {});
  });
}
ensureProductsColumns();

function migrateLegacyDatabaseIfNeeded() {
  if (!fs.existsSync(legacyDbPath) || legacyDbPath === dbPath) return;
  db.get("SELECT COUNT(*) AS c FROM products", [], function (err, row) {
    if (err || !row || Number(row.c) > 0) return;
    const legacyDb = new sqlite3.Database(legacyDbPath);
    legacyDb.serialize(() => {
      legacyDb.all("SELECT * FROM users", [], function (_e1, users) {
        (users || []).forEach((u) => {
          db.run(
            "INSERT OR IGNORE INTO users(id,email,password,role) VALUES(?,?,?,?)",
            [u.id, u.email, u.password, u.role || "user"]
          );
        });
      });
      legacyDb.all("SELECT * FROM products", [], function (_e2, products) {
        (products || []).forEach((p) => {
          db.run(
            "INSERT OR IGNORE INTO products(id,name,price,image_url,age_min,pieces,theme,stock,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            [
              p.id,
              p.name,
              p.price,
              p.image_url || "",
              p.age_min || null,
              p.pieces || null,
              p.theme || "Classic",
              Number(p.stock || 0),
              p.created_at || null,
            ]
          );
        });
      });
      legacyDb.all("SELECT * FROM orders", [], function (_e3, orders) {
        (orders || []).forEach((o) => {
          db.run(
            "INSERT OR IGNORE INTO orders(id,user_id,created_at,subtotal,tax,shipping,total,status) VALUES(?,?,?,?,?,?,?,?)",
            [o.id, o.user_id, o.created_at, o.subtotal, o.tax, o.shipping, o.total, o.status || "pending"]
          );
        });
      });
      legacyDb.all("SELECT * FROM order_items", [], function (_e4, items) {
        (items || []).forEach((it) => {
          db.run(
            "INSERT OR IGNORE INTO order_items(id,order_id,product_id,name,price,qty,image_url) VALUES(?,?,?,?,?,?,?)",
            [it.id, it.order_id, it.product_id, it.name, it.price, it.qty, it.image_url || ""]
          );
        });
      });
    });
    legacyDb.close();
  });
}
migrateLegacyDatabaseIfNeeded();

async function ensureDefaultAdmin() {
  const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  db.get(
    "SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))",
    [DEFAULT_ADMIN_EMAIL],
    function (err, row) {
      if (err) return;
      if (row) {
        db.run("UPDATE users SET password = ?, role = 'admin' WHERE id = ?", [hash, row.id]);
        return;
      }
      db.run("INSERT INTO users(email,password,role) VALUES(?,?,?)", [DEFAULT_ADMIN_EMAIL, hash, "admin"]);
    }
  );
}
ensureDefaultAdmin();

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return res.status(401).json({ message: "No token" });
  try {
    req.user = jwt.verify(h.slice(7), SECRET);
    next();
  } catch (e) {
    res.status(401).json({ message: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  db.get("SELECT role FROM users WHERE id = ?", [req.user.id], function (err, user) {
    if (err || !user) return res.status(401).json({ message: "Unauthorized" });
    if (user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    next();
  });
}

app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email and password required" });
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users(email,password,role) VALUES(?,?,?)", [email, hash, "user"], function (err) {
      if (err) return res.status(400).json({ message: "User already exists" });
      res.json({ message: "User created", userId: this.lastID });
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  db.get("SELECT * FROM users WHERE email=?", [email], async (err, user) => {
    if (!user) return res.status(401).json({ message: "User not found" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Wrong password" });
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: "1h" });
    res.json({ token, role: user.role });
  });
});

app.get("/profile", auth, (req, res) => {
  db.get("SELECT id, email, role FROM users WHERE id = ?", [req.user.id], function (err, user) {
    if (err) return res.status(500).json({ message: "Server error" });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });
});

app.get("/products", (req, res) => {
  db.all("SELECT * FROM products ORDER BY datetime(created_at) DESC, id DESC", [], function (err, rows) {
    if (err) return res.status(500).json({ message: "Server error" });
    res.json(rows || []);
  });
});

app.post("/orders", auth, async (req, res) => {
  const normalized = normalizeItems(req.body && req.body.items);
  if (!normalized.length) {
    return res.status(400).json({ message: "Order items are required" });
  }

  try {
    const productIds = normalized.map((it) => Number(it.productId)).filter((n) => Number.isFinite(n));
    if (!productIds.length) return res.status(400).json({ message: "Invalid product IDs" });

    const placeholders = productIds.map(() => "?").join(",");
    const products = await allAsync(
      "SELECT id,name,price,image_url,stock FROM products WHERE id IN (" + placeholders + ")",
      productIds
    );
    if (products.length !== productIds.length) {
      return res.status(400).json({ message: "Some products were not found" });
    }

    const byId = new Map(products.map((p) => [String(p.id), p]));
    const orderItems = [];
    for (const item of normalized) {
      const p = byId.get(String(item.productId));
      if (!p) return res.status(400).json({ message: "Invalid item in order" });
      if (Number(p.stock || 0) < item.qty) {
        return res.status(400).json({ message: "Not enough stock for " + p.name });
      }
      orderItems.push({
        product_id: String(p.id),
        name: p.name,
        price: Number(p.price),
        qty: Number(item.qty),
        image_url: p.image_url || "",
      });
    }

    const totals = calcTotals(orderItems);
    await runAsync("BEGIN TRANSACTION");
    const orderResult = await runAsync(
      "INSERT INTO orders(user_id,created_at,subtotal,tax,shipping,total,status) VALUES(?,CURRENT_TIMESTAMP,?,?,?,?,?)",
      [req.user.id, totals.subtotal, totals.tax, totals.shipping, totals.total, "pending"]
    );
    const orderId = orderResult.lastID;

    for (const it of orderItems) {
      await runAsync(
        "INSERT INTO order_items(order_id,product_id,name,price,qty,image_url) VALUES(?,?,?,?,?,?)",
        [orderId, it.product_id, it.name, it.price, it.qty, it.image_url]
      );
    }

    const qrData = generateQrData(orderId, totals.total);
    const paymentResult = await runAsync(
      "INSERT INTO payment_transactions(order_id,tx_ref,method,amount,qr_payload,qr_text,qr_expires_at,status,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
      [orderId, qrData.txRef, "qr", totals.total, qrData.qrPayload, qrData.qrText, qrData.expiresAt, "pending"]
    );
    await runAsync("COMMIT");

    res.json({
      message: "Order created. Awaiting payment.",
      order: {
        id: orderId,
        subtotal: totals.subtotal,
        tax: totals.tax,
        shipping: totals.shipping,
        total: totals.total,
        status: "pending",
      },
      payment: {
        id: paymentResult.lastID,
        tx_ref: qrData.txRef,
        method: "qr",
        amount: totals.total,
        status: "pending",
        qr_payload: qrData.qrPayload,
        qr_text: qrData.qrText,
        qr_expires_at: qrData.expiresAt,
      },
    });
  } catch (err) {
    try {
      await runAsync("ROLLBACK");
    } catch (_rollbackErr) {}
    res.status(500).json({ message: "Cannot create order" });
  }
});

app.get("/orders", auth, async (req, res) => {
  try {
    const rows = await allAsync(
      `SELECT o.id, o.created_at, o.subtotal, o.tax, o.shipping, o.total, o.status,
              p.status AS payment_status, p.tx_ref, p.qr_expires_at
         FROM orders o
         LEFT JOIN payment_transactions p ON p.id = (
           SELECT p2.id FROM payment_transactions p2 WHERE p2.order_id = o.id ORDER BY p2.id DESC LIMIT 1
         )
        WHERE o.user_id = ?
        ORDER BY o.id DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Cannot load orders" });
  }
});

app.get("/orders/:id", auth, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const order = await getAsync("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const roleRow = await getAsync("SELECT role FROM users WHERE id = ?", [req.user.id]);
    const isAdmin = roleRow && roleRow.role === "admin";
    if (!isAdmin && Number(order.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const items = await allAsync(
      "SELECT id,order_id,product_id,name,price,qty,image_url FROM order_items WHERE order_id = ? ORDER BY id ASC",
      [orderId]
    );
    const payment = await getAsync(
      "SELECT id,tx_ref,method,amount,status,paid_at,qr_payload,qr_text,qr_expires_at,created_at FROM payment_transactions WHERE order_id = ? ORDER BY id DESC LIMIT 1",
      [orderId]
    );
    let userEmail = null;
    if (isAdmin) {
      const owner = await getAsync("SELECT email FROM users WHERE id = ?", [order.user_id]);
      userEmail = owner ? owner.email : null;
    }

    res.json({ order, items, payment, userEmail });
  } catch (err) {
    res.status(500).json({ message: "Cannot load order detail" });
  }
});

async function confirmPaymentByTxRef(txRef) {
  const tx = await getAsync("SELECT * FROM payment_transactions WHERE tx_ref = ?", [txRef]);
  if (!tx) return { ok: false, status: 404, message: "Transaction not found" };
  if (tx.status === "paid") {
    return { ok: true, data: { message: "Already paid", tx_ref: txRef, order_id: tx.order_id, order_status: "confirmed" } };
  }
  if (tx.status !== "pending") return { ok: false, status: 400, message: "Transaction is not pending" };

  await runAsync("BEGIN TRANSACTION");
  try {
    const items = await allAsync(
      `SELECT oi.product_id, oi.qty, p.stock, p.name
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ?`,
      [tx.order_id]
    );
    for (const item of items) {
      if (Number(item.stock || 0) < Number(item.qty || 0)) {
        throw new Error("Not enough stock for " + item.name);
      }
    }

    await runAsync(
      "UPDATE payment_transactions SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [tx.id]
    );
    await runAsync("UPDATE orders SET status = 'confirmed' WHERE id = ?", [tx.order_id]);
    for (const item of items) {
      await runAsync("UPDATE products SET stock = stock - ? WHERE id = ?", [
        Number(item.qty),
        Number(item.product_id),
      ]);
    }
    await runAsync("COMMIT");
    return { ok: true, data: { message: "Payment confirmed", tx_ref: txRef, order_id: tx.order_id, order_status: "confirmed" } };
  } catch (err) {
    await runAsync("ROLLBACK");
    throw err;
  }
}

app.post("/payments/:txRef/confirm", async (req, res) => {
  const txRef = String(req.params.txRef || "").trim();
  if (!txRef) return res.status(400).json({ message: "Transaction reference is required" });

  try {
    const result = await confirmPaymentByTxRef(txRef);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ message: "Cannot confirm payment" });
  }
});

app.post("/payments/webhook", async (req, res) => {
  const txRef = String((req.body && req.body.tx_ref) || "").trim();
  const status = String((req.body && req.body.status) || "").toLowerCase();
  if (!txRef || !["paid", "failed", "cancelled"].includes(status)) {
    return res.status(400).json({ message: "Invalid webhook payload" });
  }

  try {
    const tx = await getAsync("SELECT * FROM payment_transactions WHERE tx_ref = ?", [txRef]);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });

    if (status === "paid") {
      const result = await confirmPaymentByTxRef(txRef);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      return res.json({ message: "Webhook processed", payment: result.data });
    }

    await runAsync(
      "UPDATE payment_transactions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [status, tx.id]
    );
    await runAsync("UPDATE orders SET status = 'pending' WHERE id = ? AND status = 'pending'", [tx.order_id]);
    return res.json({ message: "Webhook processed", tx_ref: txRef, status });
  } catch (err) {
    return res.status(500).json({ message: "Webhook processing failed" });
  }
});

app.post("/admin/products", auth, requireAdmin, upload.single("image"), (req, res) => {
  const { name, price, age_min, pieces, stock } = req.body;
  const imageUrl = req.file ? "/uploads/" + req.file.filename : "";
  if (!name || price == null) return res.status(400).json({ message: "Missing required fields" });
  db.run(
    "INSERT INTO products(name,price,image_url,age_min,pieces,theme,stock,created_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
    [name, Number(price), imageUrl, age_min || null, pieces || null, "Classic", Number(stock || 0)],
    function (err) {
      if (err) return res.status(500).json({ message: "Cannot create product" });
      res.json({ message: "Created", id: this.lastID });
    }
  );
});

app.put("/admin/products/:id", auth, requireAdmin, upload.single("image"), (req, res) => {
  const { name, price, age_min, pieces, stock } = req.body;
  db.get("SELECT image_url FROM products WHERE id = ?", [req.params.id], function (err, row) {
    if (err || !row) return res.status(404).json({ message: "Product not found" });
    const nextImage = req.file ? "/uploads/" + req.file.filename : row.image_url || "";
    db.run(
      "UPDATE products SET name=?, price=?, image_url=?, age_min=?, pieces=?, stock=? WHERE id=?",
      [name, Number(price), nextImage, age_min || null, pieces || null, Number(stock || 0), req.params.id],
      function (updateErr) {
        if (updateErr) return res.status(500).json({ message: "Cannot update product" });
        res.json({ message: "Updated" });
      }
    );
  });
});

app.delete("/admin/products/:id", auth, requireAdmin, (req, res) => {
  db.run("DELETE FROM products WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ message: "Cannot delete product" });
    res.json({ message: "Deleted" });
  });
});

app.get("/admin/users", auth, requireAdmin, (req, res) => {
  db.all("SELECT id, email, role FROM users ORDER BY id DESC", [], function (err, rows) {
    if (err) return res.status(500).json({ message: "Cannot load users" });
    res.json(rows || []);
  });
});

app.patch("/admin/users/:id/role", auth, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!["user", "admin"].includes(role)) return res.status(400).json({ message: "Invalid role" });
  db.run("UPDATE users SET role = ? WHERE id = ?", [role, req.params.id], function (err) {
    if (err) return res.status(500).json({ message: "Cannot update role" });
    res.json({ message: "Role updated" });
  });
});

app.get("/admin/orders", auth, requireAdmin, (req, res) => {
  const sql =
    "SELECT o.id, o.created_at, o.status, o.total, u.email as user_email FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.id DESC";
  db.all(sql, [], function (err, rows) {
    if (err) return res.status(500).json({ message: "Cannot load orders" });
    res.json(rows || []);
  });
});

app.patch("/admin/orders/:id/status", auth, requireAdmin, (req, res) => {
  const { status } = req.body;
  const allow = ["pending", "processing", "shipped", "completed", "cancelled", "confirmed", "paid"];
  if (!allow.includes(status)) return res.status(400).json({ message: "Invalid status" });
  db.run("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id], function (err) {
    if (err) return res.status(500).json({ message: "Cannot update status" });
    res.json({ message: "Status updated" });
  });
});

app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.message && err.message.includes("Only image uploads are allowed")) {
    return res.status(400).json({ message: "Only image files are accepted" });
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "Image must be <= 5MB" });
  }
  return res.status(500).json({ message: "Upload failed" });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

