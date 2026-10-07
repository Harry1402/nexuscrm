import {
  findContactByPhone,
  findContactByEmail,
  findLeadByPhone,
  findLeadByEmail,
  createLead,
  createCommunication,
  createCall,
  getEntityStream,
  getContact,
  getLead,
  getEntityCalls,
  getEntityNotes,
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

  /**
   * Aggregate complete Customer 360 multi-channel interaction timeline
   */
  static async getCustomer360Timeline(
    parentType: 'Contact' | 'Lead' | 'Account',
    parentId: string
  ): Promise<Customer360Data> {
    // 1. Fetch customer entity details
    let entity: any = null;
    try {
      if (parentType === 'Contact') {
        entity = await getContact(parentId);
      } else if (parentType === 'Lead') {
        entity = await getLead(parentId);
      }
    } catch (err) {
      console.warn(`[Customer360] Entity lookup warning for ${parentType}/${parentId}:`, err);
    }

    const customer: Customer360Profile = {
      id: parentId,
      name:
        entity?.name ||
        `${entity?.firstName || ''} ${entity?.lastName || ''}`.trim() ||
        'Valued Customer',
      type: parentType,
      phoneNumber: entity?.phoneNumber || '',
      emailAddress: entity?.emailAddress || '',
      title: entity?.title || '',
      accountName: entity?.accountName || '',
      assignedUserName: entity?.assignedUserName || 'Unassigned',
      status: entity?.status || 'Active',
      createdAt: entity?.createdAt,
    };

    // 2. Fetch calls and stream notes in parallel
    const [calls, streamData, directNotes] = await Promise.all([
      getEntityCalls(parentType, parentId).catch(() => []),
      getEntityStream(parentType, parentId).catch(() => ({ list: [] })),
      getEntityNotes(parentType, parentId).catch(() => []),
    ]);

    const timelineEvents: Customer360Event[] = [];

    // Helper: format ISO time to HH:MM
    const formatTime = (iso?: string) => {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } catch {
        return '';
      }
    };

    const formatDate = (iso?: string) => {
      if (!iso) return 'Recent';
      try {
        const d = new Date(iso);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) {
          return 'TODAY';
        }
        return d.toLocaleDateString();
      } catch {
        return 'Recent';
      }
    };

    // 3. Process Calls
    if (Array.isArray(calls)) {
      for (const call of calls) {
        const durationSec = parseInt(call.duration || '0', 10);
        const mins = Math.floor(durationSec / 60)
          .toString()
          .padStart(2, '0');
        const secs = (durationSec % 60).toString().padStart(2, '0');

        const recUrlMatch =
          call.description?.match(/https?:\/\/[^\s]+|recordings\/[^\s]+/) || null;
        const recordingUrl = recUrlMatch ? recUrlMatch[0] : undefined;

        timelineEvents.push({
          id: call.id,
          channel: 'CALL',
          direction: call.direction === 'Inbound' ? 'INBOUND' : 'OUTBOUND',
          timestamp: call.dateStart || call.createdAt || new Date().toISOString(),
          timeFormatted: formatTime(call.dateStart || call.createdAt),
          dateFormatted: formatDate(call.dateStart || call.createdAt),
          badge: '📞 Call',
          content: call.name || 'Voice Telephony Call',
          duration: durationSec,
          durationFormatted: `${mins}:${secs}`,
          recordingUrl,
          status: call.status || 'Held',
        });
      }
    }

    // 4. Process Activity Stream Notes
    const mergedNotes = [...(streamData?.list || []), ...(directNotes || [])];
    const seenIds = new Set<string>();

    for (const note of mergedNotes) {
      if (!note.id || seenIds.has(note.id)) continue;
      seenIds.add(note.id);

      const post = String(note.post || '');
      let channel: 'WHATSAPP' | 'SMS' | 'CALL' | 'EMAIL' | 'NOTE' = 'NOTE';
      let direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL' = 'INTERNAL';
      let badge = '📝 Note';
      let subject: string | undefined;

      // Classify omnichannel prefixes
      if (post.includes('[WHATSAPP') || post.includes('[WhatsApp')) {
        channel = 'WHATSAPP';
        badge = '💬 WhatsApp';
        direction = post.includes('INBOUND') ? 'INBOUND' : 'OUTBOUND';
      } else if (post.includes('[SMS')) {
        channel = 'SMS';
        badge = '📱 SMS';
        direction = post.includes('INBOUND') ? 'INBOUND' : 'OUTBOUND';
      } else if (post.includes('[EMAIL') || post.includes('[Email')) {
        channel = 'EMAIL';
        badge = '✉️ Email';
        direction = post.includes('INBOUND') ? 'INBOUND' : 'OUTBOUND';
      } else if (post.includes('[VOICE CALL')) {
        // Skip duplicate call notes if call entity was already processed
        continue;
      }

      // Extract subject line if present
      const subjectMatch = post.match(/Subject:\s*([^\n]+)/);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
      }

      // Clean message body
      let cleanContent = post
        .replace(/\[[A-Z\s|]+\]\s*(From|To):[^\n]+\n?/, '')
        .replace(/Subject:[^\n]+\n?/, '')
        .trim();

      if (!cleanContent) {
        cleanContent = post;
      }

      timelineEvents.push({
        id: note.id,
        channel,
        direction,
        timestamp: note.createdAt || new Date().toISOString(),
        timeFormatted: formatTime(note.createdAt),
        dateFormatted: formatDate(note.createdAt),
        badge,
        subject,
        content: cleanContent,
        status: 'DELIVERED',
      });
    }

    // 5. Sort timeline descending by timestamp
    timelineEvents.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 6. Summary metrics
    const summary = {
      totalInteractions: timelineEvents.length,
      whatsapp: timelineEvents.filter((e) => e.channel === 'WHATSAPP').length,
      sms: timelineEvents.filter((e) => e.channel === 'SMS').length,
      calls: timelineEvents.filter((e) => e.channel === 'CALL').length,
      emails: timelineEvents.filter((e) => e.channel === 'EMAIL').length,
    };

    return { customer, summary, timeline: timelineEvents };
  }

  /**
   * Render modern Customer 360 visual timeline UI HTML
   */
  static renderCustomer360Html(data: Customer360Data): string {
    const { customer, summary, timeline } = data;

    const timelineHtml =
      timeline.length === 0
        ? `<div class="empty-state">No omnichannel interactions recorded yet for this profile.</div>`
        : timeline
            .map((item) => {
              const channelColor =
                item.channel === 'WHATSAPP'
                  ? '#22c55e'
                  : item.channel === 'SMS'
                  ? '#3b82f6'
                  : item.channel === 'CALL'
                  ? '#a855f7'
                  : item.channel === 'EMAIL'
                  ? '#eab308'
                  : '#94a3b8';

              const dirBadge =
                item.direction === 'INBOUND'
                  ? '<span class="badge in">INBOUND</span>'
                  : item.direction === 'OUTBOUND'
                  ? '<span class="badge out">OUTBOUND</span>'
                  : '';

              const mediaAudio = item.recordingUrl
                ? `<div class="audio-block">
                    <span class="audio-label">▶ Audio Recording:</span>
                    <audio controls src="${item.recordingUrl}" preload="none"></audio>
                   </div>`
                : '';

              const durationTag = item.durationFormatted
                ? `<span class="duration-tag">Duration: ${item.durationFormatted}</span>`
                : '';

              const subjectTag = item.subject
                ? `<div class="subject-line"><strong>Subject:</strong> ${item.subject}</div>`
                : '';

              return `
              <div class="timeline-row">
                <div class="time-col">
                  <span class="date-badge">${item.dateFormatted}</span>
                  <span class="time-text">${item.timeFormatted || '--:--'}</span>
                </div>
                <div class="marker-col">
                  <div class="node-marker" style="background: ${channelColor}; box-shadow: 0 0 10px ${channelColor}88;"></div>
                  <div class="node-line"></div>
                </div>
                <div class="content-col">
                  <div class="event-card">
                    <div class="event-header">
                      <span class="channel-pill" style="color: ${channelColor}; border-color: ${channelColor}44; background: ${channelColor}15;">
                        ${item.badge}
                      </span>
                      ${dirBadge}
                      ${durationTag}
                    </div>
                    ${subjectTag}
                    <div class="event-body">${item.content}</div>
                    ${mediaAudio}
                  </div>
                </div>
              </div>
            `;
            })
            .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Customer 360 Timeline — ${customer.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0b0f19;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 32px 16px;
      display: flex;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 860px;
    }
    .profile-card {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 24px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .profile-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
    }
    .customer-name {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #f8fafc;
    }
    .type-badge {
      background: #3b82f620;
      border: 1px solid #3b82f660;
      color: #60a5fa;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .contact-details {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 14px;
      color: #94a3b8;
      margin-bottom: 20px;
    }
    .contact-pill {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid #334155;
    }
    .stat-box {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 10px;
      padding: 12px;
      text-align: center;
    }
    .stat-val {
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
    }
    .stat-lbl {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 2px;
    }
    .timeline-wrapper {
      position: relative;
      margin-top: 24px;
    }
    .timeline-row {
      display: flex;
      margin-bottom: 20px;
      position: relative;
    }
    .time-col {
      width: 100px;
      flex-shrink: 0;
      text-align: right;
      padding-right: 16px;
      padding-top: 4px;
    }
    .date-badge {
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.5px;
    }
    .time-text {
      font-size: 15px;
      font-weight: 600;
      color: #cbd5e1;
    }
    .marker-col {
      width: 24px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }
    .node-marker {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      margin-top: 8px;
      z-index: 2;
    }
    .node-line {
      width: 2px;
      background: #1e293b;
      flex-grow: 1;
      margin-top: 4px;
    }
    .content-col {
      flex-grow: 1;
      padding-left: 16px;
    }
    .event-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .event-header {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 10px;
    }
    .channel-pill {
      font-size: 13px;
      font-weight: 700;
      border: 1px solid;
      padding: 2px 10px;
      border-radius: 6px;
    }
    .badge {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .badge.in { background: #064e3b; color: #6ee7b7; }
    .badge.out { background: #1e3a8a; color: #93c5fd; }
    .duration-tag {
      font-size: 12px;
      color: #c084fc;
      background: #581c8730;
      border: 1px solid #581c8760;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .subject-line {
      font-size: 13px;
      color: #cbd5e1;
      margin-bottom: 8px;
    }
    .event-body {
      font-size: 14px;
      line-height: 1.5;
      color: #e2e8f0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .audio-block {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #334155;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .audio-label {
      font-size: 12px;
      color: #a855f7;
      font-weight: 600;
    }
    audio {
      width: 100%;
      height: 36px;
      border-radius: 8px;
    }
    .empty-state {
      padding: 40px;
      text-align: center;
      color: #64748b;
      background: #1e293b;
      border-radius: 12px;
      border: 1px dashed #334155;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="profile-card">
      <div class="profile-title-row">
        <h1 class="customer-name">${customer.name}</h1>
        <span class="type-badge">${customer.type}</span>
      </div>
      <div class="contact-details">
        ${customer.phoneNumber ? `<span class="contact-pill">📱 ${customer.phoneNumber}</span>` : ''}
        ${customer.emailAddress ? `<span class="contact-pill">✉️ ${customer.emailAddress}</span>` : ''}
        <span class="contact-pill">👤 Assigned: ${customer.assignedUserName}</span>
      </div>
      <div class="stats-row">
        <div class="stat-box"><div class="stat-val">${summary.totalInteractions}</div><div class="stat-lbl">Total Touches</div></div>
        <div class="stat-box"><div class="stat-val" style="color:#22c55e;">${summary.whatsapp}</div><div class="stat-lbl">💬 WhatsApp</div></div>
        <div class="stat-box"><div class="stat-val" style="color:#3b82f6;">${summary.sms}</div><div class="stat-lbl">📱 SMS</div></div>
        <div class="stat-box"><div class="stat-val" style="color:#a855f7;">${summary.calls}</div><div class="stat-lbl">📞 Calls</div></div>
        <div class="stat-box"><div class="stat-val" style="color:#eab308;">${summary.emails}</div><div class="stat-lbl">✉️ Emails</div></div>
      </div>
    </div>

    <div class="timeline-wrapper">
      ${timelineHtml}
    </div>
  </div>
</body>
</html>`;
  }
}

export interface Customer360Profile {
  id: string;
  name: string;
  type: 'Contact' | 'Lead' | 'Account';
  phoneNumber?: string;
  emailAddress?: string;
  title?: string;
  accountName?: string;
  assignedUserName?: string;
  status?: string;
  createdAt?: string;
}

export interface Customer360Event {
  id: string;
  channel: 'WHATSAPP' | 'SMS' | 'CALL' | 'EMAIL' | 'NOTE';
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  timestamp: string;
  timeFormatted: string;
  dateFormatted: string;
  badge: string;
  subject?: string;
  content: string;
  duration?: number;
  durationFormatted?: string;
  recordingUrl?: string;
  status: string;
}

export interface Customer360Data {
  customer: Customer360Profile;
  summary: {
    totalInteractions: number;
    whatsapp: number;
    sms: number;
    calls: number;
    emails: number;
  };
  timeline: Customer360Event[];
}

