import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

export interface PgConnectionInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  templateDb: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    pg: PgConnectionInfo;
  }
}

const ROOT = path.resolve(__dirname, '..', '..');

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function readMigrations(): { name: string; sql: string }[] {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

/**
 * Starts ONE embedded PostgreSQL server for the whole test run and builds a template
 * database (Supabase auth stub + all real migrations + test clock). Every test file
 * clones the template, so tests are isolated and fast.
 */
export default async function setup(project: TestProject) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'padel-pg-'));
  const port = await freePort();
  const info: PgConnectionInfo = {
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password: 'postgres',
    templateDb: 'padel_template',
  };

  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: info.user,
    password: info.password,
    port,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  });
  await server.initialise();
  await server.start();

  const connect = async (database: string) => {
    const client = new pg.Client({ ...info, database });
    await client.connect();
    return client;
  };

  const boot = await connect('postgres');
  await boot.query(`create database ${info.templateDb}`);
  await boot.end();

  const tpl = await connect(info.templateDb);
  try {
    await tpl.query(fs.readFileSync(path.join(__dirname, 'support', 'auth-stub.sql'), 'utf8'));
    for (const m of readMigrations()) {
      try {
        await tpl.query(m.sql);
      } catch (err) {
        throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`);
      }
    }
    await tpl.query(fs.readFileSync(path.join(__dirname, 'support', 'test-clock.sql'), 'utf8'));
  } finally {
    await tpl.end();
  }

  project.provide('pg', info);

  return async () => {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}
