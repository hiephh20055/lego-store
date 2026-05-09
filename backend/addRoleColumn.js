const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("users.db");

db.run(
"ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
function(err){

if(err){
console.log("Column may already exist:", err.message)
}else{
console.log("Role column added")
}

db.close()

})