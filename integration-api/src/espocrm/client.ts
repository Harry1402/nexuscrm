import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';

export const espocrm: AxiosInstance = axios.create({
  baseURL: `${env.ESPOCRM_SITE_URL}/api/v1`,
  headers: {
    'X-Api-Key': env.ESPOCRM_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// ─── Health ───────────────────────────────────────────────────────────────────

export async function checkEspoHealth(): Promise<boolean> {
  try {
    const res = await espocrm.get('/App/user');
    return res.status === 200;
  } catch {
    return false;
  }
}

// ─── Contact / Lead Lookup ────────────────────────────────────────────────────

export async function findContactByPhone(phone: string) {
  const res = await espocrm.get('/Contact', {
    params: {
      where: [{ type: 'equals', attribute: 'phoneNumber', value: phone }],
    },
  });
  return res.data;
}

export async function findContactByEmail(email: string) {
  const res = await espocrm.get('/Contact', {
    params: {
      where: [{ type: 'equals', attribute: 'emailAddress', value: email }],
    },
  });
  return res.data;
}

export async function findLeadByPhone(phone: string) {
  const res = await espocrm.get('/Lead', {
    params: {
      where: [{ type: 'equals', attribute: 'phoneNumber', value: phone }],
    },
  });
  return res.data;
}

// ─── Record Creation ──────────────────────────────────────────────────────────

export async function createLead(data: Record<string, any>) {
  const res = await espocrm.post('/Lead', data);
  return res.data;
}

/**
 * Record a unified communication event (WhatsApp, SMS, Email, Call)
 * in the EspoCRM Activity stream via the Note entity.
 */
export async function createCommunication(data: {
  parentType: 'Contact' | 'Lead' | 'Account';
  parentId: string;
  post: string;
  type?: string;
}) {
  const res = await espocrm.post('/Note', {
    type: 'Post',
    parentType: data.parentType,
    parentId: data.parentId,
    post: data.post,
  });
  return res.data;
}

export async function createMessage(data: Record<string, any>) {
  const res = await espocrm.post('/Message', data);
  return res.data;
}

export async function createCall(data: Record<string, any>) {
  const res = await espocrm.post('/Call', data);
  return res.data;
}

/**
 * Upload a file attachment linked to a CRM record.
 * Pass file contents as a base64-encoded string.
 */
export async function createAttachment(data: {
  name: string;
  type: string;          // MIME type, e.g. 'audio/mpeg'
  size: number;
  contents: string;      // base64-encoded file content
  parentType: string;
  parentId: string;
  field?: string;
}) {
  const res = await espocrm.post('/Attachment', data);
  return res.data;
}
