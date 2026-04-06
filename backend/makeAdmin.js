
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const emailArg = process.argv[2];

if (!emailArg || !emailArg.includes("@")) {
  console.error("Cách dùng: node makeAdmin.js <email-da-dang-ky>");
  console.error("Ví dụ: node makeAdmin.js 22070006@vnu.edu.vn");
  process.exit(1);
}

const normalized = emailArg.trim().toLowerCase();

const dbBackend = path.join(__dirname, "users.db");
const dbRoot = path.join(__dirname, "..", "users.db");

function listUsers(dbPath, label) {
  return new Promise(function (resolve) {
    if (!fs.existsSync(dbPath)) {
      console.log(label + ": (không có file)");
      resolve([]);
      return;
    }
    const db = new sqlite3.Database(dbPath);
    db.all("SELECT id, email, role FROM users ORDER BY id", function (err, rows) {
      db.close();
      if (err) {
        console.log(label + ": lỗi đọc —", err.message);
        resolve([]);
        return;
      }
      console.log("\n" + label + " (" + dbPath + "):");
      if (!rows || rows.length === 0) {
        console.log("  (chưa có user nào)");
      } else {
        rows.forEach(function (r) {
          console.log("  id=" + r.id + " | " + r.email + " | role=" + r.role);
        });
      }
      resolve(rows || []);
    });
  });
}

function trySetAdmin(dbPath) {
  return new Promise(function (resolve) {
    if (!fs.existsSync(dbPath)) {
      resolve({ path: dbPath, changes: 0, skipped: true });
      return;
    }
    const db = new sqlite3.Database(dbPath);
    db.run(
      "UPDATE users SET role=? WHERE LOWER(TRIM(email))=?",
      ["admin", normalized],
      function (err) {
        const changes = err ? 0 : this.changes;
        db.close(function () {
          resolve({ path: dbPath, changes: changes, err: err });
        });
      }
    );
  });
}

(async function () {
  console.log("Email cần set admin (chuẩn hóa):", normalized);

  let r1 = await trySetAdmin(dbBackend);
  if (!r1.skipped && r1.changes > 0) {
    console.log("\nOK — Đã cập nhật", r1.changes, "dòng trong:\n  ", r1.path);
    console.log("→ Đăng nhập lại bằng đúng mật khẩu lúc đăng ký.");
    process.exit(0);
  }

  let r2 = await trySetAdmin(dbRoot);
  if (!r2.skipped && r2.changes > 0) {
    console.log(
      "\nOK — Đã cập nhật trong file ở thư mục gốc project (không phải backend):"
    );
    console.log("  ", r2.path);
    console.log(
      "\n⚠ Server hiện tại thường dùng backend/users.db. Nếu đăng nhập vẫn không phải admin,"
    );
    console.log("  hãy chạy lại makeAdmin sau khi đã đăng ký lại, hoặc xóa file users.db thừa ở thư mục gốc.");
    console.log("→ Đăng nhập lại bằng đúng mật khẩu lúc đăng ký.");
    process.exit(0);
  }

  console.log("\n--- Không khớp email nào trong cả hai file (số dòng cập nhật: 0) ---");
  await listUsers(dbBackend, "backend/users.db");
  await listUsers(dbRoot, "thư mục gốc project users.db");

  console.log(
    "\n→ Hãy đăng ký tài khoản trên web trước (cùng email bạn vừa gõ), rồi chạy lại lệnh."
  );
  console.log(
    "→ Copy email **y hệt** một dòng trong danh sách trên (hoặc dùng đúng email đã đăng ký)."
  );
  process.exit(1);
})();
