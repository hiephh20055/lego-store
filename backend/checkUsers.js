/**
 * Liệt kê user trong users.db (cùng thư mục backend).
 * Chạy: node checkUsers.js
 */
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "users.db");
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, email, role FROM users ORDER BY id", (err, rows) => {
  if (err) {
    console.error("Lỗi:", err.message);
    db.close();
    process.exit(1);
  }
  console.log("Database:", dbPath);
  console.log(rows);
  db.close();
});
