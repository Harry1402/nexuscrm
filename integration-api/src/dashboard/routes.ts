import { Router, Request, Response } from 'express';
import { checkEspoHealth } from '../espocrm/client';
import { checkStorageHealth } from '../storage/minio';
import { EmailService } from '../email/service';
import { env } from '../config/env';

export const dashboardRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ServiceStatus {
  label: string;
  icon: string;
  status: 'up' | 'down' | 'configured' | 'unconfigured' | 'checking';
  detail: string;
}

async function gatherServiceStatuses(): Promise<Record<string, ServiceStatus>> {
  const [espoUp, minioUp, smtpUp] = await Promise.all([
    checkEspoHealth().catch(() => false),
    checkStorageHealth().catch(() => false),
    env.SMTP_HOST ? EmailService.checkSmtpHealth().catch(() => false) : null,
  ]);

  return {
    espocrm: {
      label: 'EspoCRM',
      icon: '🗂️',
      status: espoUp ? 'up' : 'down',
      detail: espoUp ? `Reachable at ${env.ESPOCRM_SITE_URL}` : 'Unreachable — check container',
    },
    minio: {
      label: 'MinIO Storage',
      icon: '🗄️',
      status: minioUp ? 'up' : 'down',
      detail: minioUp ? `Bucket: ${env.MINIO_BUCKET}` : 'Bucket unreachable — check credentials',
    },
    smtp: {
      label: 'SMTP Email',
      icon: '✉️',
      status: !env.SMTP_HOST
        ? 'unconfigured'
        : smtpUp
        ? 'up'
        : 'down',
      detail: !env.SMTP_HOST
        ? 'SMTP_HOST not set in .env'
        : smtpUp
        ? `Connected to ${env.SMTP_HOST}:${env.SMTP_PORT}`
        : 'Connection failed — check credentials',
    },
    twilio: {
      label: 'Twilio SMS/Voice',
      icon: '📞',
      status: env.TWILIO_ACCOUNT_SID ? 'configured' : 'unconfigured',
      detail: env.TWILIO_ACCOUNT_SID
        ? `Account SID: ${env.TWILIO_ACCOUNT_SID.slice(0, 8)}…`
        : 'TWILIO_ACCOUNT_SID not set in .env',
    },
    whatsapp: {
      label: 'WhatsApp Cloud API',
      icon: '💬',
      status: env.WHATSAPP_ACCESS_TOKEN ? 'configured' : 'unconfigured',
      detail: env.WHATSAPP_ACCESS_TOKEN
        ? `Phone ID: ${env.WHATSAPP_PHONE_NUMBER_ID || 'set'}`
        : 'WHATSAPP_ACCESS_TOKEN not set in .env',
    },
  };
}

// ─── Route: JSON Status ────────────────────────────────────────────────────────

/**
 * GET /dashboard/status
 * Machine-readable JSON health snapshot — safe for monitoring agents.
 */
dashboardRouter.get('/status', async (_req: Request, res: Response): Promise<void> => {
  const services = await gatherServiceStatuses();
  const simplified = Object.fromEntries(
    Object.entries(services).map(([k, v]) => [k, v.status])
  );
  res.status(200).json({
    service: 'nexus-crm-integration-api',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    services: simplified,
  });
});

// ─── Route: HTML Dashboard ─────────────────────────────────────────────────────

/**
 * GET /dashboard
 * Live server-rendered HTML Operations Dashboard.
 * No secrets, credentials, or PII are exposed in the rendered output.
 */
dashboardRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  const services = await gatherServiceStatuses();
  const uptimeSec = Math.floor(process.uptime());
  const uptimeStr = formatUptime(uptimeSec);
  const now = new Date().toISOString();

  const serviceCards = Object.entries(services)
    .map(([, svc]) => renderServiceCard(svc))
    .join('');

  const html = buildDashboardHtml({
    serviceCards,
    uptime: uptimeStr,
    now,
    environment: env.NODE_ENV,
    espoUrl: env.ESPOCRM_SITE_URL,
    minioConsole: env.MINIO_ENDPOINT.replace(':9000', ':9001'),
  });

  res.type('text/html').send(html);
});

// ─── Renderers ────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusMeta(status: ServiceStatus['status']): { color: string; glow: string; label: string; dot: string } {
  switch (status) {
    case 'up':
      return { color: '#22c55e', glow: '#22c55e55', label: 'UP', dot: '●' };
    case 'down':
      return { color: '#ef4444', glow: '#ef444455', label: 'DOWN', dot: '●' };
    case 'configured':
      return { color: '#3b82f6', glow: '#3b82f655', label: 'CONFIGURED', dot: '●' };
    case 'unconfigured':
      return { color: '#64748b', glow: 'transparent', label: 'NOT SET', dot: '○' };
    default:
      return { color: '#eab308', glow: '#eab30855', label: 'CHECKING', dot: '◌' };
  }
}

function renderServiceCard(svc: ServiceStatus): string {
  const meta = statusMeta(svc.status);
  const pulse = svc.status === 'up' ? 'class="pulse-dot"' : '';
  return `
    <div class="service-card">
      <div class="service-icon">${svc.icon}</div>
      <div class="service-info">
        <div class="service-name">${svc.label}</div>
        <div class="service-detail">${svc.detail}</div>
      </div>
      <div class="status-pill" style="color:${meta.color}; border-color:${meta.color}40; background:${meta.color}12;">
        <span ${pulse} style="color:${meta.color}; filter: drop-shadow(0 0 4px ${meta.glow});">${meta.dot}</span>
        ${meta.label}
      </div>
    </div>`;
}

const ENDPOINTS = [
  { method: 'GET',  path: '/health',                                  desc: 'Full stack health check' },
  { method: 'GET',  path: '/dashboard/status',                        desc: 'JSON service status snapshot' },
  { method: 'POST', path: '/api/v1/timeline/events',                  desc: 'Record omnichannel event' },
  { method: 'GET',  path: '/api/v1/timeline/:parentType/:parentId',   desc: 'Entity activity stream' },
  { method: 'GET',  path: '/api/v1/timeline/customer360/:type/:id',   desc: 'Customer 360 JSON timeline' },
  { method: 'GET',  path: '/api/v1/timeline/customer360/:type/:id/view', desc: 'Customer 360 visual UI' },
  { method: 'GET',  path: '/api/v1/whatsapp/webhook',                 desc: 'WhatsApp hub verification' },
  { method: 'POST', path: '/api/v1/whatsapp/webhook',                 desc: 'Inbound WhatsApp messages' },
  { method: 'POST', path: '/api/v1/twilio/sms',                       desc: 'Inbound Twilio SMS webhook' },
  { method: 'POST', path: '/api/v1/twilio/voice',                     desc: 'Inbound Twilio Voice webhook' },
  { method: 'POST', path: '/api/v1/twilio/recording',                 desc: 'Call recording callback' },
  { method: 'POST', path: '/api/v1/twilio/status',                    desc: 'SMS status callback' },
  { method: 'POST', path: '/api/v1/email/send',                       desc: 'Send transactional email' },
];

function methodColor(method: string): string {
  switch (method) {
    case 'GET':  return '#22c55e';
    case 'POST': return '#3b82f6';
    case 'PUT':  return '#eab308';
    case 'DELETE': return '#ef4444';
    default: return '#94a3b8';
  }
}

function renderEndpointRows(): string {
  return ENDPOINTS.map(e => `
    <tr>
      <td><span class="method-badge" style="color:${methodColor(e.method)};border-color:${methodColor(e.method)}40;background:${methodColor(e.method)}15;">${e.method}</span></td>
      <td class="endpoint-path"><code>${e.path}</code></td>
      <td class="endpoint-desc">${e.desc}</td>
    </tr>`).join('');
}

// ─── HTML Template ─────────────────────────────────────────────────────────────

function buildDashboardHtml(ctx: {
  serviceCards: string;
  uptime: string;
  now: string;
  environment: string;
  espoUrl: string;
  minioConsole: string;
}): string {
  const envBadgeColor = ctx.environment === 'production' ? '#ef4444' : '#eab308';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>NexusCRM — Operations Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg-base:    #070b14;
      --bg-card:    #0d1526;
      --bg-card2:   #111827;
      --border:     #1e2d47;
      --border2:    #1f2937;
      --text-main:  #e2e8f0;
      --text-muted: #64748b;
      --text-sub:   #94a3b8;
      --accent:     #6366f1;
      --accent-glow:#6366f140;
    }

    body {
      background: var(--bg-base);
      color: var(--text-main);
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      padding: 0 0 80px;
    }

    /* ── Header ─────────────────────────── */
    .top-bar {
      background: linear-gradient(90deg, #0d1526 0%, #070b14 100%);
      border-bottom: 1px solid var(--border);
      padding: 18px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(10px);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      width: 38px; height: 38px;
      background: linear-gradient(135deg, #6366f1, #a855f7);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
      box-shadow: 0 0 20px #6366f140;
    }
    .brand-name {
      font-size: 18px; font-weight: 700;
      background: linear-gradient(135deg, #e2e8f0, #94a3b8);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .brand-sub {
      font-size: 11px; color: var(--text-muted);
      font-weight: 500; text-transform: uppercase; letter-spacing: 1px;
    }
    .top-meta {
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    }
    .env-badge {
      font-size: 11px; font-weight: 700;
      padding: 3px 10px; border-radius: 999px;
      text-transform: uppercase; letter-spacing: 0.5px;
      color: ${envBadgeColor};
      border: 1px solid ${envBadgeColor}40;
      background: ${envBadgeColor}12;
    }
    .refresh-btn {
      font-size: 12px; font-weight: 600;
      color: var(--accent); border: 1px solid var(--accent-glow);
      background: var(--accent-glow); padding: 6px 14px; border-radius: 8px;
      cursor: pointer; text-decoration: none;
      transition: background 0.2s, box-shadow 0.2s;
    }
    .refresh-btn:hover {
      background: #6366f130; box-shadow: 0 0 14px #6366f140;
    }

    /* ── Layout ─────────────────────────── */
    .container { max-width: 1100px; margin: 0 auto; padding: 40px 24px 0; }

    .section-title {
      font-size: 12px; font-weight: 700;
      color: var(--text-muted); text-transform: uppercase;
      letter-spacing: 1.2px; margin-bottom: 16px;
    }

    /* ── Stat Row ───────────────────────── */
    .stat-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
      margin-bottom: 36px;
    }
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px 22px;
      display: flex; align-items: center; gap: 16px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .stat-card:hover { border-color: #334155; box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
    .stat-icon {
      font-size: 24px; width: 46px; height: 46px;
      background: var(--bg-card2); border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .stat-val { font-size: 22px; font-weight: 800; color: #f8fafc; }
    .stat-lbl { font-size: 12px; color: var(--text-muted); margin-top: 2px; font-weight: 500; }

    /* ── Service Cards ──────────────────── */
    .service-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 14px;
      margin-bottom: 36px;
    }
    .service-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px 20px;
      display: flex; align-items: center; gap: 14px;
      transition: border-color 0.2s, transform 0.15s;
    }
    .service-card:hover { border-color: #334155; transform: translateY(-2px); }
    .service-icon { font-size: 22px; flex-shrink: 0; }
    .service-info { flex-grow: 1; min-width: 0; }
    .service-name { font-size: 14px; font-weight: 600; color: #f1f5f9; }
    .service-detail { font-size: 12px; color: var(--text-muted); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status-pill {
      font-size: 11px; font-weight: 700;
      padding: 4px 12px; border-radius: 999px;
      border: 1px solid; white-space: nowrap;
      display: flex; align-items: center; gap: 6px;
      flex-shrink: 0; letter-spacing: 0.5px;
    }

    /* Pulsing dot for "up" services */
    @keyframes pulse-ring {
      0%   { opacity: 1; transform: scale(1); }
      70%  { opacity: 0; transform: scale(2.2); }
      100% { opacity: 0; transform: scale(2.2); }
    }
    .pulse-dot { animation: pulse-blink 2s ease-in-out infinite; }
    @keyframes pulse-blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }

    /* ── Endpoints Table ────────────────── */
    .table-wrapper {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 36px;
    }
    table { width: 100%; border-collapse: collapse; }
    thead { background: var(--bg-card2); }
    th {
      text-align: left; padding: 12px 18px;
      font-size: 11px; font-weight: 700;
      color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px;
      border-bottom: 1px solid var(--border);
    }
    td { padding: 12px 18px; border-bottom: 1px solid var(--border2); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #0f1a2e; }
    .method-badge {
      font-size: 11px; font-weight: 700;
      padding: 2px 8px; border-radius: 5px;
      border: 1px solid; font-family: 'JetBrains Mono', monospace;
    }
    .endpoint-path code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px; color: #a5b4fc;
    }
    .endpoint-desc { font-size: 13px; color: var(--text-sub); }

    /* ── Quick Links ────────────────────── */
    .links-row {
      display: flex; flex-wrap: wrap; gap: 12px;
      margin-bottom: 36px;
    }
    .quick-link {
      display: flex; align-items: center; gap: 8px;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 10px; padding: 10px 18px;
      text-decoration: none; color: #94a3b8;
      font-size: 13px; font-weight: 500;
      transition: border-color 0.2s, color 0.2s, box-shadow 0.2s;
    }
    .quick-link:hover {
      border-color: var(--accent); color: #a5b4fc;
      box-shadow: 0 0 16px var(--accent-glow);
    }

    /* ── Footer ─────────────────────────── */
    .footer {
      text-align: center; color: var(--text-muted);
      font-size: 12px; margin-top: 60px; padding-top: 24px;
      border-top: 1px solid var(--border);
    }
    .divider { height: 1px; background: var(--border); margin: 36px 0; }

    @media (max-width: 640px) {
      .top-bar { padding: 14px 20px; flex-direction: column; gap: 10px; align-items: flex-start; }
      .container { padding: 24px 16px 0; }
    }
  </style>
</head>
<body>

<div class="top-bar">
  <div class="brand">
    <div class="brand-icon">🔗</div>
    <div>
      <div class="brand-name">NexusCRM Integration API</div>
      <div class="brand-sub">Operations Dashboard</div>
    </div>
  </div>
  <div class="top-meta">
    <span class="env-badge">${ctx.environment}</span>
    <a class="refresh-btn" href="/dashboard">↻ Refresh</a>
  </div>
</div>

<div class="container">

  <!-- ── Stats ─────────────────────── -->
  <div class="stat-row" style="margin-top:0; padding-top:40px;">
    <div class="stat-card">
      <div class="stat-icon">⏱️</div>
      <div>
        <div class="stat-val">${ctx.uptime}</div>
        <div class="stat-lbl">Process Uptime</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">🔌</div>
      <div>
        <div class="stat-val">${ENDPOINTS.length}</div>
        <div class="stat-lbl">Active Endpoints</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">🕐</div>
      <div>
        <div class="stat-val" style="font-size:14px;margin-top:4px;">${ctx.now.replace('T', ' ').replace('Z', ' UTC').slice(0, 23)}</div>
        <div class="stat-lbl">Last Checked (UTC)</div>
      </div>
    </div>
  </div>

  <!-- ── Service Health ─────────────── -->
  <div class="section-title">🔬 Service Health</div>
  <div class="service-grid">
    ${ctx.serviceCards}
  </div>

  <!-- ── Quick Links ───────────────── -->
  <div class="section-title">🔗 Quick Links</div>
  <div class="links-row">
    <a class="quick-link" href="${ctx.espoUrl}" target="_blank" rel="noopener">🗂️ EspoCRM Web UI</a>
    <a class="quick-link" href="${ctx.minioConsole}" target="_blank" rel="noopener">🗄️ MinIO Console</a>
    <a class="quick-link" href="/health">❤️ Health JSON</a>
    <a class="quick-link" href="/dashboard/status">📊 Status JSON</a>
    <a class="quick-link" href="/api/v1/timeline/customer360/Contact/CONTACT_ID/view">👤 Customer 360 View</a>
  </div>

  <div class="divider"></div>

  <!-- ── Endpoints ─────────────────── -->
  <div class="section-title">📋 API Endpoint Reference</div>
  <div class="table-wrapper">
    <table>
      <thead>
        <tr>
          <th style="width:80px">Method</th>
          <th>Endpoint</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${renderEndpointRows()}
      </tbody>
    </table>
  </div>

  <div class="footer">
    NexusCRM Integration API &nbsp;·&nbsp; Built with TypeScript + Express &nbsp;·&nbsp;
    Generated at ${ctx.now}
  </div>

</div>
</body>
</html>`;
}
