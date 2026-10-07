import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TimelineService } from './service';

export const timelineRouter = Router();

// Zod Schema for incoming timeline event recording
const TimelineEventSchema = z.object({
  type: z.enum(['WHATSAPP', 'SMS', 'CALL', 'EMAIL']),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  parentId: z.string().min(1).max(64).optional(),
  parentType: z.enum(['Contact', 'Lead', 'Account']).optional(),
  sender: z.string().min(1).max(256),
  recipient: z.string().min(1).max(256),
  body: z.string().max(10000).optional(),
  subject: z.string().max(500).optional(),
  duration: z.number().int().nonnegative().optional(),
  recordingUrl: z.string().url().max(1000).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  timestamp: z.string().datetime().optional(),
  status: z.enum(['RECEIVED', 'SENT', 'DELIVERED', 'COMPLETED', 'FAILED']).default('RECEIVED'),
});

// Allowed entity types for timeline query
const AllowedParentTypes = ['Contact', 'Lead', 'Account'] as const;

/**
 * POST /api/v1/timeline/events
 * Record an omnichannel event into the CRM timeline.
 */
timelineRouter.post('/events', async (req: Request, res: Response): Promise<void> => {
  const parseResult = TimelineEventSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid timeline event payload',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const result = await TimelineService.recordEvent(parseResult.data);
    res.status(result.success ? 201 : 207).json(result);
  } catch (err: any) {
    console.error('[Timeline Route Error]', err);
    res.status(500).json({ error: 'Failed to record timeline event' });
  }
});

/**
 * GET /api/v1/timeline/:parentType/:parentId
 * Retrieve activity stream / timeline history for a specific entity.
 * Protected with BOLA defense (verifies entity type and format).
 */
timelineRouter.get('/:parentType/:parentId', async (req: Request, res: Response): Promise<void> => {
  const parentType = Array.isArray(req.params.parentType) ? req.params.parentType[0] : req.params.parentType;
  const parentId = Array.isArray(req.params.parentId) ? req.params.parentId[0] : req.params.parentId;

  // 1. Strict validation of entity type
  if (!AllowedParentTypes.includes(parentType as any)) {
    res.status(400).json({
      error: `Invalid parentType. Must be one of: ${AllowedParentTypes.join(', ')}`,
    });
    return;
  }

  // 2. Strict ID format validation (EspoCRM IDs are alphanumeric strings, 1-64 chars)
  if (!parentId || !/^[a-zA-Z0-9_-]{1,64}$/.test(parentId)) {
    res.status(400).json({ error: 'Invalid parentId format' });
    return;
  }

  try {
    const stream = await TimelineService.getTimelineForEntity(
      parentType as 'Contact' | 'Lead' | 'Account',
      parentId
    );
    res.status(200).json({ parentType, parentId, stream });
  } catch (err: any) {
    console.error(`[Timeline Route Error for ${parentType}/${parentId}]`, err);
    res.status(502).json({ error: 'Failed to retrieve timeline stream from CRM' });
  }
});
