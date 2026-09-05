import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as identity from "./schema/identity";
import * as domain from "./schema/domain";

export const schema = { ...identity, ...domain };

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export * from "./schema/identity";
export * from "./schema/domain";
