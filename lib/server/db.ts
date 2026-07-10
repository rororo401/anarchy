import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export type QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
  rows: Row[];
  rowCount: number;
};

export type DatabaseClient = {
  query: <Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, parameters?: unknown[]) => Promise<QueryResult<Row>>;
};

const filename = process.env.SQLITE_PATH ?? join(process.cwd(), "data", "anarchos.sqlite");
mkdirSync(dirname(filename), { recursive: true });

const sqlite = new DatabaseSync(filename);
sqlite.exec("PRAGMA busy_timeout = 5000");
const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
let initialized = false;

export const db: DatabaseClient & { end: () => Promise<void> } = {
  query,
  async end() {
    sqlite.close();
  },
};

let transactionQueue = Promise.resolve();

export async function withTransaction<T>(run: (client: DatabaseClient) => Promise<T>) {
  const previous = transactionQueue;
  let release = () => {};
  transactionQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    ensureInitialized();
    sqlite.exec("BEGIN IMMEDIATE");
    const result = await run(db);
    sqlite.exec("COMMIT");
    return result;
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    release();
  }
}

async function query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, parameters: unknown[] = []): Promise<QueryResult<Row>> {
  ensureInitialized();
  const values: SQLInputValue[] = [];
  const statement = sqlite.prepare(sql.replace(/\$(\d+)/g, (_, index: string) => {
    values.push(toSqliteValue(parameters[Number(index) - 1]));
    return "?";
  }));
  if (/^\s*(?:SELECT|PRAGMA|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
    const rows = statement.all(...values) as Row[];
    return { rows, rowCount: rows.length };
  }
  const result = statement.run(...values);
  return { rows: [], rowCount: Number(result.changes) };
}

function ensureInitialized() {
  if (initialized) return;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      sqlite.exec(schema);
      initialized = true;
      return;
    } catch (error) {
      if (!isLocked(error) || attempt === 19) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

function isLocked(error: unknown) {
  return error instanceof Error && error.message.includes("database is locked");
}

function toSqliteValue(value: unknown): SQLInputValue {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}
