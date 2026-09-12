import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as path from 'path';

export interface ProviderConnectionRecord {
  provider: string;
  mode: 'api' | 'cli';
  model: string;
  endpoint?: string | null;
  executable?: string | null;
  enabled: boolean;
  lastTestAt?: number | null;
  lastStatus?: 'untested' | 'connected' | 'error' | null;
  lastError?: string | null;
}

export interface AuditRecord {
  id: number;
  timestamp: number;
  category: string;
  action: string;
  details: string;
  blocked: boolean;
}

export class DatabaseService {
  private readonly db: DatabaseSync;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath, { timeout: 5000 });
    this.initialize();
  }

  private initialize() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA secure_delete = ON;
      PRAGMA trusted_schema = OFF;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_connections (
        provider TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('api', 'cli')),
        model TEXT NOT NULL,
        endpoint TEXT,
        executable TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_test_at INTEGER,
        last_status TEXT,
        last_error TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS protected_secrets (
        provider TEXT PRIMARY KEY,
        ciphertext_b64 TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(provider) REFERENCES provider_connections(provider) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        blocked INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp DESC);
      INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', '2');
    `);
  }

  public getStatus() {
    const version = this.db.prepare('SELECT sqlite_version() AS version').get() as { version?: string } | undefined;
    const schema = this.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as { value?: string } | undefined;
    const journal = this.db.prepare('PRAGMA journal_mode').get() as Record<string, unknown> | undefined;
    return {
      connected: true,
      path: this.dbPath,
      sqliteVersion: version?.version || 'unknown',
      schemaVersion: schema?.value || 'unknown',
      journalMode: journal ? String(Object.values(journal)[0] ?? 'unknown') : 'unknown',
    };
  }

  public getSetting<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key) as { value_json?: string } | undefined;
    if (!row?.value_json) return fallback;
    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return fallback;
    }
  }

  public setSetting(key: string, value: unknown) {
    const payload = JSON.stringify(value);
    if (payload.length > 1_000_000) throw new Error('Setting payload exceeds safety limit');
    this.db.prepare(`
      INSERT INTO app_settings(key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
    `).run(key, payload, Date.now());
  }

  public listProviderConnections(): ProviderConnectionRecord[] {
    const rows = this.db.prepare(`
      SELECT provider, mode, model, endpoint, executable, enabled, last_test_at, last_status, last_error
      FROM provider_connections
      ORDER BY provider ASC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      provider: String(row.provider),
      mode: row.mode === 'cli' ? 'cli' : 'api',
      model: String(row.model || ''),
      endpoint: row.endpoint == null ? null : String(row.endpoint),
      executable: row.executable == null ? null : String(row.executable),
      enabled: Number(row.enabled) === 1,
      lastTestAt: row.last_test_at == null ? null : Number(row.last_test_at),
      lastStatus: row.last_status === 'connected' || row.last_status === 'error' ? row.last_status : 'untested',
      lastError: row.last_error == null ? null : String(row.last_error),
    }));
  }

  public getProviderConnection(provider: string): ProviderConnectionRecord | null {
    return this.listProviderConnections().find((item) => item.provider === provider) || null;
  }

  public saveProviderConnection(record: ProviderConnectionRecord) {
    this.db.prepare(`
      INSERT INTO provider_connections(provider, mode, model, endpoint, executable, enabled, last_test_at, last_status, last_error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        mode=excluded.mode,
        model=excluded.model,
        endpoint=excluded.endpoint,
        executable=excluded.executable,
        enabled=excluded.enabled,
        last_test_at=excluded.last_test_at,
        last_status=excluded.last_status,
        last_error=excluded.last_error,
        updated_at=excluded.updated_at
    `).run(
      record.provider,
      record.mode,
      record.model,
      record.endpoint ?? null,
      record.executable ?? null,
      record.enabled ? 1 : 0,
      record.lastTestAt ?? null,
      record.lastStatus ?? 'untested',
      record.lastError ?? null,
      Date.now(),
    );
  }

  public updateProviderTestStatus(provider: string, ok: boolean, error?: string) {
    this.db.prepare(`
      UPDATE provider_connections
      SET last_test_at=?, last_status=?, last_error=?, updated_at=?
      WHERE provider=?
    `).run(Date.now(), ok ? 'connected' : 'error', ok ? null : (error || 'Connection test failed').slice(0, 500), Date.now(), provider);
  }

  public deleteProviderConnection(provider: string) {
    this.db.prepare('DELETE FROM provider_connections WHERE provider = ?').run(provider);
  }

  public setProtectedSecret(provider: string, ciphertextB64: string) {
    this.db.prepare(`
      INSERT INTO protected_secrets(provider, ciphertext_b64, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET ciphertext_b64=excluded.ciphertext_b64, updated_at=excluded.updated_at
    `).run(provider, ciphertextB64, Date.now());
  }

  public getProtectedSecret(provider: string): string | null {
    const row = this.db.prepare('SELECT ciphertext_b64 FROM protected_secrets WHERE provider = ?').get(provider) as { ciphertext_b64?: string } | undefined;
    return row?.ciphertext_b64 || null;
  }

  public hasProtectedSecret(provider: string): boolean {
    return Boolean(this.getProtectedSecret(provider));
  }

  public saveProject(project: unknown) {
    if (!project || typeof project !== 'object') throw new Error('Invalid project payload');
    const id = String((project as { id?: unknown }).id || '').slice(0, 200);
    if (!id) throw new Error('Project id is required');
    const payload = JSON.stringify(project);
    if (payload.length > 25_000_000) throw new Error('Project payload exceeds 25 MB safety limit');
    this.db.prepare(`
      INSERT INTO projects(id, data_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at
    `).run(id, payload, Date.now());
  }

  public loadProject<T>(id: string): T | null {
    const row = this.db.prepare('SELECT data_json FROM projects WHERE id = ?').get(id) as { data_json?: string } | undefined;
    if (!row?.data_json) return null;
    try {
      return JSON.parse(row.data_json) as T;
    } catch {
      return null;
    }
  }

  public appendAudit(category: string, action: string, details: string, blocked = false) {
    this.db.prepare(`
      INSERT INTO audit_events(timestamp, category, action, details, blocked)
      VALUES (?, ?, ?, ?, ?)
    `).run(Date.now(), category.slice(0, 80), action.slice(0, 120), details.slice(0, 2000), blocked ? 1 : 0);
    this.db.exec(`
      DELETE FROM audit_events
      WHERE id NOT IN (SELECT id FROM audit_events ORDER BY timestamp DESC LIMIT 5000)
    `);
  }

  public listAudit(limit = 200): AuditRecord[] {
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    const rows = this.db.prepare(`
      SELECT id, timestamp, category, action, details, blocked
      FROM audit_events
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(safeLimit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      timestamp: Number(row.timestamp),
      category: String(row.category),
      action: String(row.action),
      details: String(row.details),
      blocked: Number(row.blocked) === 1,
    }));
  }

  public close() {
    this.db.close();
  }
}
