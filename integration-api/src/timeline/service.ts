import {
  findContactByPhone,
  findContactByEmail,
  findLeadByPhone,
  findLeadByEmail,
  createLead,
  createCommunication,
  createCall,
  getEntityStream,
} from '../espocrm/client';

export type ChannelType = 'WHATSAPP' | 'SMS' | 'CALL' | 'EMAIL';
export type DirectionType = 'INBOUND' | 'OUTBOUND';
export type EventStatus = 'RECEIVED' | 'SENT' | 'DELIVERED' | 'COMPLETED' | 'FAILED';

export interface TimelineEvent {
  id?: string;
  type: ChannelType;
  direction: DirectionType;
  parentId?: string;
  parentType?: 'Contact' | 'Lead' | 'Account';
  sender: string;
  recipient: string;
  body?: string;
  subject?: string;
  duration?: number;
  recordingUrl?: string;
  metadata?: Record<string, any>;
  timestamp?: string;
  status: EventStatus;
}

export interface RecordEventResult {
  success: boolean;
  event: TimelineEvent;
  parentType?: string;
  parentId?: string;
  espoRecordId?: string;
  error?: string;
}

export class TimelineService {
  /**
   * Resolve an associated Contact or Lead by phone number or email address.
   * If neither exists, creates a new Lead automatically.
   */
  static async resolveParent(
    identifier: string,
    channel: ChannelType
  ): Promise<{ parentType: 'Contact' | 'Lead'; parentId: string }> {
    const isEmail = identifier.includes('@');
    const cleanId = identifier.trim();

    try {
      if (isEmail) {
        // 1. Try finding Contact
        const contacts = await findContactByEmail(cleanId);
        if (contacts?.list && contacts.list.length > 0) {
          return { parentType: 'Contact', parentId: contacts.list[0].id };
        }

        // 2. Try finding Lead
        const leads = await findLeadByEmail(cleanId);
        if (leads?.list && leads.list.length > 0) {
          return { parentType: 'Lead', parentId: leads.list[0].id };
        }

        // 3. Auto-create Lead
        const newLead = await createLead({
          firstName: 'Inbound',
          lastName: cleanId.split('@')[0] || 'Email Lead',
          emailAddress: cleanId,
          source: channel,
          status: 'New',
          description: `Auto-generated from inbound ${channel} event`,
        });
        return { parentType: 'Lead', parentId: newLead.id };
      } else {
        // Phone lookup
        const phone = cleanId;

        // 1. Try finding Contact
        const contacts = await findContactByPhone(phone);
        if (contacts?.list && contacts.list.length > 0) {
          return { parentType: 'Contact', parentId: contacts.list[0].id };
        }

        // 2. Try finding Lead
        const leads = await findLeadByPhone(phone);
        if (leads?.list && leads.list.length > 0) {
          return { parentType: 'Lead', parentId: leads.list[0].id };
        }

        // 3. Auto-create Lead
        const newLead = await createLead({
          firstName: 'Inbound',
          lastName: phone,
          phoneNumber: phone,
          source: channel,
          status: 'New',
          description: `Auto-generated from inbound ${channel} communication`,
        });
        return { parentType: 'Lead', parentId: newLead.id };
      }
    } catch (err: any) {
      console.error(`[TimelineService] Error resolving parent for ${identifier}:`, err?.message || err);
      throw err;
    }
  }

  /**
   * Normalize, resolve parent entity, and record an omnichannel event in EspoCRM.
   */
  static async recordEvent(event: TimelineEvent): Promise<RecordEventResult> {
    const timestamp = event.timestamp || new Date().toISOString();
    const normalizedEvent: TimelineEvent = {
      ...event,
      timestamp,
    };

    let parentType = event.parentType;
    let parentId = event.parentId;

    // Automatically resolve parent if missing
    if (!parentId || !parentType) {
      const customerIdentifier =
        event.direction === 'INBOUND' ? event.sender : event.recipient;
      if (customerIdentifier) {
        try {
          const resolved = await this.resolveParent(customerIdentifier, event.type);
          parentType = resolved.parentType;
          parentId = resolved.parentId;
        } catch (resolveErr: any) {
          console.warn(
            `[TimelineService] Unable to auto-resolve parent for ${customerIdentifier}:`,
            resolveErr?.message
          );
        }
      }
    }

    normalizedEvent.parentType = parentType;
    normalizedEvent.parentId = parentId;

    let espoRecordId: string | undefined;

    // If parent was resolved or provided, post to EspoCRM
    if (parentType && parentId) {
      try {
        if (event.type === 'CALL') {
          // Log Call entity
          const callData = {
            name: `${event.direction === 'INBOUND' ? 'Inbound' : 'Outbound'} Call (${event.sender} -> ${event.recipient})`,
            status: event.status === 'COMPLETED' ? 'Held' : 'Planned',
            direction: event.direction === 'INBOUND' ? 'Inbound' : 'Outbound',
            dateStart: timestamp,
            duration: event.duration || 0,
            parentType,
            parentId,
            description: [
              event.body || '',
              event.recordingUrl ? `Recording: ${event.recordingUrl}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          };

          const createdCall = await createCall(callData);
          espoRecordId = createdCall?.id;

          // Also post a note to the Activity Stream for unified timeline visibility
          const callNote = `📞 [VOICE CALL | ${event.direction}] Duration: ${event.duration || 0}s\nStatus: ${event.status}\n${event.recordingUrl ? `Audio Recording: ${event.recordingUrl}` : ''}`;
          await createCommunication({
            parentType,
            parentId,
            post: callNote,
          });
        } else {
          // Channels: WHATSAPP, SMS, EMAIL
          const channelIcon =
            event.type === 'WHATSAPP'
              ? '💬 [WHATSAPP'
              : event.type === 'SMS'
              ? '📱 [SMS'
              : '✉️ [EMAIL';

          const party =
            event.direction === 'INBOUND'
              ? `From: ${event.sender}`
              : `To: ${event.recipient}`;

          const subjectLine = event.subject ? `Subject: ${event.subject}\n` : '';
          const bodyContent = event.body || '(No message content)';

          const streamPost = `${channelIcon} | ${event.direction}] ${party}\n${subjectLine}\n${bodyContent}`;

          const note = await createCommunication({
            parentType,
            parentId,
            post: streamPost,
          });
          espoRecordId = note?.id;
        }
      } catch (crmErr: any) {
        console.error(
          `[TimelineService] Failed to record communication in EspoCRM:`,
          crmErr?.message || crmErr
        );
        return {
          success: false,
          event: normalizedEvent,
          parentType,
          parentId,
          error: crmErr?.message || 'EspoCRM recording error',
        };
      }
    }

    console.log(
      `[Timeline Event Processed] [${normalizedEvent.type}] [${normalizedEvent.direction}] Parent: ${parentType || 'none'}/${parentId || 'none'}`
    );

    return {
      success: true,
      event: normalizedEvent,
      parentType,
      parentId,
      espoRecordId,
    };
  }

  /**
   * Retrieve timeline stream history for a specific entity.
   */
  static async getTimelineForEntity(
    parentType: 'Contact' | 'Lead' | 'Account',
    parentId: string
  ): Promise<any> {
    try {
      return await getEntityStream(parentType, parentId);
    } catch (err: any) {
      console.error(
        `[TimelineService] Failed to fetch stream for ${parentType}/${parentId}:`,
        err?.message || err
      );
      throw err;
    }
  }
}
