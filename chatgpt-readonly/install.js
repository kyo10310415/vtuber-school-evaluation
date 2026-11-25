import pg from "pg";
import reader from "./reader.cjs";
import { getDatabaseConfig } from "../src/lib/database-config.js";
import { createCatalog } from "./catalog.js";
export function installChatgptReadOnly(app, env = process.env) {
  let pool;
  const read = reader.createReader({
    catalog: createCatalog(env),
    token: () => env.CHATGPT_READ_TOKEN,
    pool: {
      connect() {
        pool ??= new pg.Pool({
          ...getDatabaseConfig(env.DATABASE_URL, env),
          max: 2,
          connectionTimeoutMillis: 5000,
          statement_timeout: 10000,
        });
        return pool.connect();
      },
    },
  });
  app.all("/integrations/chatgpt/v1/*", async (c) => {
    let input;
    try {
      const raw = c.req.query("request");
      if (raw !== undefined) {
        if (raw.length > 8000) throw new Error();
        input = JSON.parse(raw);
      }
    } catch {
      return c.json({ error: "Invalid query" }, 400);
    }
    const result = await read({
      method: c.req.method,
      authorization: c.req.header("authorization"),
      path: c.req.path.slice("/integrations/chatgpt/v1".length),
      input,
    });
    c.header("Cache-Control", "no-store");
    return c.json(result.body, result.status);
  });
}
