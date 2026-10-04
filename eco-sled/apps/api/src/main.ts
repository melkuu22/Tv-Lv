import { join } from "node:path";
import { jwtSecret } from "./auth.ts";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";

const port = Number(process.env.PORT ?? 4173);
const dbPath = process.env.ECO_DB_PATH ?? join(process.cwd(), "data", "eco.db");
const db = openDatabase(dbPath);
const app = createApp(db, jwtSecret());

app.listen(port, "0.0.0.0", () => {
  console.log(`Эко-След слушает http://localhost:${port}`);
});
