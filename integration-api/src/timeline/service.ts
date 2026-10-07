export type ChannelType = 'WHATSAPP' | 'SMS' | 'CALL' | 'EMAIL';
export type DirectionType = 'INBOUND' | 'OUTBOUND';
export type EventStatus = 'RECEIVED' | 'SENT' | 'DELIVERED' | 'COMPLETED' | 'FAILED';

export interface TimelineEvent {
  id?: string;
  type: ChannelType;
  direction: DirectionType;
  contactId?: string;
  leadId?: string;
  sender?: string;
  recipient?: string;
  body?: string;
  subject?: string;
  duration?: number;
  recordingUrl?: string;
  timestamp: string;
  status: EventStatus;
}

export class TimelineService {
  /**
   * Normalize and log an omnichannel communication event
   */
  static async recordEvent(event: TimelineEvent): Promise<TimelineEvent> {
    const normalizedEvent: TimelineEvent = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    console.log(`[Timeline Event Recorded] [${normalizedEvent.type}] [${normalizedEvent.direction}] Contact: ${normalizedEvent.contactId || 'unknown'}`);
    return normalizedEvent;
  }
}
