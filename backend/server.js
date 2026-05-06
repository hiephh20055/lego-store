const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

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
  const allow = ["pending", "processing", "shipped", "completed", "cancelled", "confirmed"];
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

