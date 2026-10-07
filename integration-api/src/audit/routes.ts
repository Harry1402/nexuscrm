import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuditLogger } from './logger';

export const auditRouter = Router();

// Query param schema — limit must be 1–500, defaults to 100
const AuditQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 100))
    .pipe(z.number().int().min(1).max(500)),
  level: z
    .enum(['INFO', 'WARN', 'ERROR'])
    .optional(),
  category: z
    .enum(['WEBHOOK', 'TIMELINE', 'LEAD_CREATE', 'CALL', 'EMAIL', 'SYSTEM'])
    .optional(),
});

/**
 * GET /api/v1/audit/log
 * Returns the last N audit entries from the in-memory ring buffer.
 * Optional query params: ?limit=100&level=ERROR&category=WEBHOOK
 * No PII or secrets are exposed — phone/email values are pre-masked by AuditLogger.
 */
auditRouter.get('/log', (req: Request, res: Response): void => {
  const parseResult = AuditQuerySchema.safeParse(req.query);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid query parameters',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  const { limit, level, category } = parseResult.data;

  let entries = AuditLogger.getLast(limit);

  // Optional client-side filters (already have newest-first ordering)
  if (level) {
    entries = entries.filter((e) => e.level === level);
  }
  if (category) {
    entries = entries.filter((e) => e.category === category);
  }

  res.status(200).json({
    total: AuditLogger.total,
    returned: entries.length,
    filters: { limit, level: level ?? null, category: category ?? null },
    entries,
  });
});

/**
 * GET /api/v1/audit/stats
 * Returns aggregate counts by level and category from the current ring buffer.
 */
auditRouter.get('/stats', (_req: Request, res: Response): void => {
  const all = AuditLogger.getLast(500);

  const byLevel = { INFO: 0, WARN: 0, ERROR: 0 };
  const byCategory: Record<string, number> = {};

  for (const e of all) {
    byLevel[e.level] = (byLevel[e.level] || 0) + 1;
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
  }

  res.status(200).json({
    totalLifetime: AuditLogger.total,
    inBuffer: all.length,
    byLevel,
    byCategory,
  });
});
