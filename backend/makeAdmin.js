
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const emailArg = process.argv[2];

if (!emailArg || !emailArg.includes("@")) {
  console.error("Usage: node makeAdmin.js <registered-email>");
  console.error("Example: node makeAdmin.js 22070006@vnu.edu.vn");
  process.exit(1);
}

const normalized = emailArg.trim().toLowerCase();

const dbBackend = path.join(__dirname, "users.db");
const dbRoot = path.join(__dirname, "..", "users.db");

function listUsers(dbPath, label) {
  return new Promise(function (resolve) {
    if (!fs.existsSync(dbPath)) {
      console.log(label + ": (file not found)");
      resolve([]);
      return;
    }
    const db = new sqlite3.Database(dbPath);
    db.all("SELECT id, email, role FROM users ORDER BY id", function (err, rows) {
      db.close();
      if (err) {
        console.log(label + ": read error —", err.message);
        resolve([]);
        return;
      }
      console.log("\n" + label + " (" + dbPath + "):");
      if (!rows || rows.length === 0) {
        console.log("  (no users found)");
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
  console.log("Email to set as admin (normalized):", normalized);

  let r1 = await trySetAdmin(dbBackend);
  if (!r1.skipped && r1.changes > 0) {
    console.log("\nOK — Updated", r1.changes, "row(s) in:\n  ", r1.path);
    console.log("→ Log in again using the password you registered with.");
    process.exit(0);
  }

  let r2 = await trySetAdmin(dbRoot);
  if (!r2.skipped && r2.changes > 0) {
    console.log(
      "\nOK — Updated record in the project root file (not backend):"
    );
    console.log("  ", r2.path);
    console.log(
      "\n⚠ The server typically uses backend/users.db. If you still don't have admin access after login,"
    );
    console.log("  re-run makeAdmin after re-registering, or delete the extra users.db in the project root.");
    console.log("→ Log in again using the password you registered with.");
    process.exit(0);
  }

  console.log("\n--- No email match found in either database file (rows updated: 0) ---");
  await listUsers(dbBackend, "backend/users.db");
  await listUsers(dbRoot, "project root users.db");

  console.log(
    "\n→ Register an account on the web first (using the same email you typed), then run this command again."
  );
  console.log(
    "→ Copy the email **exactly** as it appears in the list above (or use the exact email you registered with)."
  );
  process.exit(1);
})();
