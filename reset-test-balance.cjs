// Simple script to reset Jamie Chen's balance
const Database = require("./backend/node_modules/better-sqlite3");
const db = new Database("./backend/data/telecom.db");
db.prepare("UPDATE telco_accounts SET balance = 13.79 WHERE user_id = ?").run("user-2");
const result = db.prepare("SELECT balance FROM telco_accounts WHERE user_id = ?").get("user-2");
console.log("Reset Jamie Chen balance to:", result.balance);
db.close();
