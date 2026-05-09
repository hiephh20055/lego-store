/**
 * Create / reset a temporary admin account for login (dev only).
 * Run: node seedTempAdmin.js
 */
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const path = require("path");

const dbPath = path.join(__dirname, "users.db");

const TEMP_EMAIL = "admin@playarena.local";
const TEMP_PASSWORD = "Admin123!";

async function main() {
  const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
  const db = new sqlite3.Database(dbPath);

  db.get(
    "SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))",
    [TEMP_EMAIL],
    function (err, row) {
      if (err) {
        console.error(err);
        db.close();
        process.exit(1);
      }

      if (row) {
        db.run(
          "UPDATE users SET password = ?, role = ? WHERE id = ?",
          [hash, "admin", row.id],
          function (e2) {
            if (e2) {
              console.error(e2);
              db.close();
              process.exit(1);
            }
            printDone("Password and admin role reset for existing user.");
            db.close();
          }
        );
      } else {
        db.run(
          "INSERT INTO users(email, password, role) VALUES (?, ?, ?)",
          [TEMP_EMAIL, hash, "admin"],
          function (e3) {
            if (e3) {
              console.error(e3);
              db.close();
              process.exit(1);
            }
            printDone("New admin account created.");
            db.close();
          }
        );
      }
    }
  );
}

function printDone(msg) {
  console.log("\n--- " + msg + " ---");
  console.log("Email:    ", TEMP_EMAIL);
  console.log("Password: ", TEMP_PASSWORD);
  console.log("\nLog in at login.html → will redirect to admin.html.");
  console.log("(Delete or change the password before deploying to production.)\n");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
