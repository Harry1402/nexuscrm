import { randomBytes } from 'crypto';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditLevel    = 'INFO' | 'WARN' | 'ERROR';
export type AuditCategory = 'WEBHOOK' | 'TIMELINE' | 'LEAD_CREATE' | 'CALL' | 'EMAIL' | 'SYSTEM';

export interface AuditEntry {
  id: string;
  timestamp: string;
  level: AuditLevel;
  category: AuditCategory;
  message: string;
  meta?: Record<string, string | number | boolean>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum entries kept in the in-memory ring buffer */
const RING_BUFFER_SIZE = 500;

/** Absolute path to the append-only log file */
const LOG_DIR  = join(process.cwd(), 'logs');
const LOG_FILE = join(LOG_DIR, 'audit.log');

// ─── AuditLogger ──────────────────────────────────────────────────────────────

class AuditLoggerClass {
  private readonly buffer: AuditEntry[] = [];

  constructor() {
    // Ensure the logs/ directory exists on first use
    if (!existsSync(LOG_DIR)) {
      try {
        mkdirSync(LOG_DIR, { recursive: true });
      } catch {
        // Non-fatal — may lack write permission in some environments
      }
    }

    // Bootstrap system-start entry
    this._append({
      id: this._id(),
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'SYSTEM',
      message: 'NexusCRM Integration API started — audit logger initialised',
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Record a structured audit entry.
   * Writes to the in-memory ring buffer and appends to logs/audit.log.
   * Phone numbers and email addresses in `meta` are partially masked.
   */
  record(
    level: AuditLevel,
    category: AuditCategory,
    message: string,
    meta?: Record<string, string | number | boolean>
  ): AuditEntry {
    const entry: AuditEntry = {
      id: this._id(),
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      meta: meta ? this._maskMeta(meta) : undefined,
    };

    this._append(entry);
    return entry;
  }

  /** Convenience wrappers */
  info(category: AuditCategory, message: string, meta?: Record<string, string | number | boolean>) {
    return this.record('INFO', category, message, meta);
  }

  warn(category: AuditCategory, message: string, meta?: Record<string, string | number | boolean>) {
    return this.record('WARN', category, message, meta);
  }

  error(category: AuditCategory, message: string, meta?: Record<string, string | number | boolean>) {
    return this.record('ERROR', category, message, meta);
  }

  /**
   * Retrieve the last `n` audit entries from the ring buffer (newest first).
   * n is clamped to [1, RING_BUFFER_SIZE].
   */
  getLast(n: number = 100): AuditEntry[] {
    const clamped = Math.min(Math.max(1, n), RING_BUFFER_SIZE);
    return [...this.buffer].reverse().slice(0, clamped);
  }

  /** Total entries recorded in this process lifetime */
  get total(): number {
    return this._totalCount;
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private _totalCount = 0;

  private _id(): string {
    return randomBytes(4).toString('hex');
  }

  private _append(entry: AuditEntry): void {
    // Ring buffer — evict oldest entry when full
    if (this.buffer.length >= RING_BUFFER_SIZE) {
      this.buffer.shift();
    }
    this.buffer.push(entry);
    this._totalCount++;

    // Append JSON line to file — non-blocking best-effort
    try {
      appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      // File write failure is non-fatal; in-memory buffer remains the source of truth
    }

    // Console output
    const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
    console.log(`[AUDIT][${entry.level}][${entry.category}] ${entry.message}${metaStr}`);
  }

  /**
   * Partially mask sensitive fields: phone numbers and email addresses.
   * Keeps first 4 + last 2 chars of phones; keeps first 2 chars of email local part.
   */
  private _maskMeta(
    meta: Record<string, string | number | boolean>
  ): Record<string, string | number | boolean> {
    const masked: Record<string, string | number | boolean> = {};
    for (const [key, val] of Object.entries(meta)) {
      if (typeof val === 'string') {
        const lk = key.toLowerCase();
        if (lk.includes('phone') || lk.includes('from') || lk.includes('to') || lk.includes('sender') || lk.includes('recipient')) {
          masked[key] = this._maskPhone(val);
        } else if (lk.includes('email')) {
          masked[key] = this._maskEmail(val);
        } else {
          masked[key] = val;
        }
      } else {
        masked[key] = val;
      }
    }
    return masked;
  }

  private _maskPhone(phone: string): string {
    if (phone.length <= 6) return '***';
    return phone.slice(0, 4) + '***' + phone.slice(-2);
  }

  private _maskEmail(email: string): string {
    const atIdx = email.indexOf('@');
    if (atIdx < 1) return '***';
    const local = email.slice(0, atIdx);
    const domain = email.slice(atIdx);
    return local.slice(0, 2) + '***' + domain;
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

/** Global singleton audit logger — import and call `.info()` / `.warn()` / `.error()` anywhere */
export const AuditLogger = new AuditLoggerClass();
