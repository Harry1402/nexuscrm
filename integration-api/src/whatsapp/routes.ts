import { Router, Request, Response } from 'express';
import { WhatsAppService } from './service';

export const whatsappRouter = Router();

// GET /webhook - Meta webhook verification handshake
whatsappRouter.get('/', (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  const verifiedChallenge = WhatsAppService.verifyWebhook(mode, token, challenge);
  if (verifiedChallenge) {
    res.status(200).send(verifiedChallenge);
    return;
  }
  res.status(403).json({ error: 'Verification failed' });
});

// POST /webhook - Inbound message webhook
whatsappRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  // Acknowledge receipt to Meta immediately (200 OK)
  res.status(200).send('EVENT_RECEIVED');

  try {
    const messages = WhatsAppService.extractMessages(req.body);
    for (const msg of messages) {
      console.log(`[WhatsApp Inbound] From: ${msg.from}, Body: ${msg.text}`);
      // In Phase 11 & 15, timeline service will record this event in EspoCRM
    }
  } catch (err) {
    console.error('Error handling WhatsApp webhook:', err);
  }
});
