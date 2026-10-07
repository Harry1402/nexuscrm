import { Router, Request, Response } from 'express';

export const twilioRouter = Router();

// POST /sms - Inbound SMS Webhook
twilioRouter.post('/sms', (req: Request, res: Response): void => {
  const from = req.body.From;
  const body = req.body.Body;

  console.log(`[Twilio SMS Inbound] From: ${from}, Body: ${body}`);

  // Return standard empty TwiML response
  res.type('text/xml');
  res.send('<Response></Response>');
});

// POST /voice - Inbound Voice Webhook
twilioRouter.post('/voice', (req: Request, res: Response): void => {
  const from = req.body.From;
  console.log(`[Twilio Voice Inbound] From: ${from}`);

  // Return TwiML response to record the call or route
  res.type('text/xml');
  res.send(`
    <Response>
      <Say>Thank you for calling NexusCRM. Please leave a message after the beep.</Say>
      <Record maxLength="60" action="/api/v1/twilio/recording" />
    </Response>
  `.trim());
});

// POST /recording - Call recording callback
twilioRouter.post('/recording', (req: Request, res: Response): void => {
  const recordingUrl = req.body.RecordingUrl;
  const recordingDuration = req.body.RecordingDuration;
  console.log(`[Twilio Recording] URL: ${recordingUrl}, Duration: ${recordingDuration}s`);

  res.sendStatus(200);
});
