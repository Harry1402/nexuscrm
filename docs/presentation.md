# NexusCRM: Hackathon Pitch Deck & Live Demo Playbook

This document serves as the official pitch narrative, slide deck structure, rehearsed live demo script, and technical Q&A defense playbook for presenting **NexusCRM** to hackathon judges and enterprise sponsors.

---

## 1. 10-Slide Pitch Presentation Structure

### Slide 1: Title & Vision
- **Title**: **NexusCRM**
- **Tagline**: *"Your customer data shouldn't require someone else's cloud."*
- **Presenters**: The NexusCRM Engineering Team
- **Core Message**: Modern businesses are held hostage by proprietary, closed-cloud CRMs that fragment communication history and charge extortionate premiums for storage and telephony integrations. NexusCRM is a fully self-hosted, enterprise-grade, omnichannel CRM built for total data sovereignty.

---

### Slide 2: The Core Problem
- **Headline**: The Fragmented Customer Experience
- **The Pain**:
  - Customer conversations happen on **WhatsApp**, updates arrive via **SMS**, orders are confirmed over **Email**, and escalations happen via **Voice calls**.
  - Traditional CRMs treat these as isolated silos or require dozens of disconnected SaaS subscriptions.
  - Representatives operate in the dark: a support agent cannot see the WhatsApp message sent 5 minutes ago, and a sales rep cannot listen to the escalation call recorded yesterday.
- **The Cost**: Lost deals, breached SLAs, redundant customer inquiries, and vendor lock-in.

---

### Slide 3: System Architecture
- **Headline**: Decoupled, API-First Microservice Architecture
- **Visual**: Architectural topology diagram showing:
  - **EspoCRM Core**: Robust open-source CRM engine powering business records and 5-tier RBAC.
  - **TypeScript Integration API**: Ultra-fast asynchronous microservice ingesting multi-channel webhooks.
  - **MariaDB 11+**: Relational database with InnoDB indexing and named volume persistence.
  - **MinIO Object Storage**: S3-compatible, on-premise object storage for call recordings and documents.
- **Key Metric**: Sub-10ms microservice response time with zero CRM cold-start overhead.

---

### Slide 4: Strict 5-Tier RBAC & BOLA Defense
- **Headline**: Enterprise Security From the Ground Up
- **Hierarchy**:
  1. `Super Admin` (System configuration, user management, audit logs)
  2. `Admin` (Team supervision, entity templates, broad access)
  3. `Manager` (Team pipeline oversight, lead approvals, call review)
  4. `Sales Executive` (Owns leads, deals, WhatsApp/SMS direct outreach)
  5. `Support / User` (Restricted to assigned support tickets; denied revenue & opportunity records)
- **Zero-Trust Backend**: Every API query is enforced on the server. Public routes cannot be exploited via IDOR/BOLA attacks.

---

### Slide 5: The Hero Feature — Customer 360 Unified Timeline
- **Headline**: Every Touchpoint in a Single Pane of Glass
- **Mockup / Demo Preview**:
  ```
  RAHUL SHARMA ────────────────────────────────── 📱 +91 98765 43210
  TODAY
  10:42  [WhatsApp]  "Where is my order confirmation?"
  10:47  [SMS]       "Your order #8291 is out for delivery."
  11:05  [Voice]     Duration: 04:21  ▶ Play Recording (MinIO)
  11:30  [Email]     "Invoice & Delivery Receipt dispatched"
  ──────────────────────────────────────────────────────────────────
  LEADS | OPPORTUNITIES | TASKS | NOTES | ATTACHMENTS
  ```
- **Value**: Instant context for agents across every channel without switching tabs.

---

### Slide 6: Self-Hosted Cloud Infrastructure
- **Headline**: True Data Sovereignty (Docker + MariaDB + MinIO)
- **Key Points**:
  - **Zero Cloud Dependence**: Entire platform runs locally or in a private VPC.
  - **MinIO S3 Compatible**: Call recordings (`.mp3` / `.wav`) and attachments streamed securely with AWS SDK v3 without third-party cloud egress fees.
  - **Granular Persistent Volumes**:
    - `espocrm_db`: Relational tables.
    - `espocrm_data`: System configurations and CRM uploads.
    - `espocrm_custom`: Backend PHP extensions.
    - `minio_data`: S3 media buckets.
  - Complete disaster recovery with zero data loss across container teardowns.

---

### Slide 7: Omnichannel Communication Engine
- **Headline**: Native Bidirectional Pipelines
- **Channels**:
  - **Meta WhatsApp Cloud API**: Webhook verification, HMAC SHA256 signature validation, and 2-way message dispatch.
  - **Twilio Voice & SMS**: TwiML voice response generation, automated call recording callback ingest, and outbound SMS.
  - **SMTP / IMAP Email**: Transactional Nodemailer pipeline with automated timeline synchronization.
- **Asynchronous Normalization**: All external webhooks are normalized into unified timeline records linked to Leads and Contacts.

---

### Slide 8: Competitive Benchmark — Why EspoCRM?
- **Headline**: Data-Driven Platform Selection
- **Comparison Table Summary**:
  - **Twenty CRM**: Promising TypeScript stack, but lacks mature VoIP, granular field RBAC, and requires a heavy 4-container stack.
  - **Frappe CRM**: Highly capable, but tightly coupled to the bulky Frappe/ERPNext ecosystem.
  - **SuiteCRM**: Deep legacy technical debt, slow container initialization, complex Smarty template engine.
  - **EspoCRM (Winner)**: Clean REST API, fast SPA frontend, lightweight Docker footprint (~150MB), native Entity Manager, and rock-solid 5-tier RBAC.

---

### Slide 9: Enterprise Security & Auditability
- **Headline**: Bank-Grade Observability
- **Capabilities**:
  - **Structured Audit Logger**: In-memory ring buffer (500 events) + append-only disk logging (`logs/audit.log`).
  - **Automatic PII Masking**: Customer phone numbers and email addresses automatically redacted from system logs.
  - **Real-Time Operations Dashboard**: Visual overview of service connectivity (EspoCRM, MinIO, WhatsApp, Twilio, SMTP) and daily traffic volume.
  - **Granular Health Checks**: `/health`, `/health/espocrm`, `/health/minio`, `/health/twilio`, `/health/whatsapp`.

---

### Slide 10: Turnkey Deployment & Business Impact
- **Headline**: Reproducible in Seconds
- **Deployment**:
  ```bash
  git clone https://github.com/Harry1402/nexuscrm.git
  cd nexuscrm
  cp .env.example .env
  docker compose up -d
  ```
- **Cost Savings**: Eliminates $150+/user/month Salesforce/HubSpot licensing fees while keeping 100% of sensitive customer PII under company control.

---

## 2. The 17-Step Rehearsed Live Demo Sequence

Follow this exact sequential workflow during the live pitch (Target Time: 3 to 4 minutes):

1. **Step 1**: Open browser to `http://localhost:8080`.
2. **Step 2**: Log in as a **Sales Executive** (`sales1`).
3. **Step 3**: Navigate to **Contacts** and open customer `Rahul Sharma` (or `Alice Johnson`).
4. **Step 4**: Trigger outbound **WhatsApp** communication via the Integration API (`POST /api/v1/whatsapp/send`).
5. **Step 5**: Show instant appearance of incoming WhatsApp reply on the timeline.
6. **Step 6**: Simulate an incoming customer **Voice Call** (`POST /api/v1/twilio/voice`).
7. **Step 7**: Simulate call completion with recording URL (`POST /api/v1/twilio/recording`).
8. **Step 8**: Navigate to the Contact's Call History panel.
9. **Step 9**: Click and play the **Call Recording audio snippet** streamed directly from MinIO S3 storage.
10. **Step 10**: Trigger an outbound transactional **SMS** (`POST /api/v1/twilio/sms/send`).
11. **Step 11**: Trigger a delivery confirmation **Email** (`POST /api/v1/email/send`).
12. **Step 12**: Open the **Customer 360 Unified Timeline** (`/api/v1/timeline/customer360/contact/{id}/view`) — highlight the unified chronological conversation thread across all 4 channels.
13. **Step 13**: Log out of the Sales Executive session.
14. **Step 14**: Log in as **Support / User** (`support1`).
15. **Step 15**: Attempt to view high-value Opportunities or Sales Pipelines → **ACCESS DENIED (403 Forbidden)** (Proves strict RBAC & BOLA defense).
16. **Step 16**: Open **MinIO Console** (`http://localhost:9001`) → Show stored call recording audio objects in the `crm-files` bucket.
17. **Step 17**: Switch to terminal and run `docker compose ps` and `bash scripts/healthcheck.sh` → Show all services green and healthy.

> **Key takeaway for judges**: *"This isn't just a prototype web application — this is a production-ready, self-hosted omnichannel CRM infrastructure."*

---

## 3. Team Responsibilities Matrix (4-Person Team)

| Role | Primary Focus | Key Responsibilities |
| :--- | :--- | :--- |
| **Person 1**<br>*(CRM & RBAC Lead)* | EspoCRM Core | • EspoCRM setup & configuration<br>• 5-Tier RBAC role definitions & ACLs<br>• Entity Manager customization & field links<br>• Realistic demo seeder (`seed.js`, `seed-roles.js`) |
| **Person 2**<br>*(Integration API Lead)* | Microservice Backend | • TypeScript Express server architecture<br>• EspoCRM REST API bridge (`espocrm/client.ts`)<br>• Customer 360 aggregator (`timeline/service.ts`)<br>• Audit logger & Operations Dashboard |
| **Person 3**<br>*(Communications & Storage)* | Omnichannel & S3 | • Meta WhatsApp Cloud API webhooks & signature verification<br>• Twilio SMS & Voice TwiML handlers<br>• MinIO S3 SDK integration (`storage/minio.ts`)<br>• SMTP transactional email service |
| **Person 4**<br>*(DevOps & Presentation)* | Infrastructure & Pitch | • Docker Compose orchestration & persistent volumes<br>• Health check probes (`scripts/healthcheck.sh`)<br>• One-command deployment engine (`scripts/deploy.sh`)<br>• Slide deck, live demo rehearsal, and pitch delivery |

---

## 4. Guiding Rules: What To Do vs. What NOT To Do

### ❌ What NOT To Do (Avoid Engineering Traps):
- **Don't rewrite the CRM frontend**: Rebuilding entity managers and Kanban boards from scratch wastes hundreds of hours.
- **Don't build custom database schemas for standard CRM entities**: Leverage EspoCRM's battle-tested data models.
- **Don't attempt to build an in-house SIP server**: Use Twilio / Asterisk bridges for voice telephony.
- **Don't implement proprietary mail daemons**: Use standard SMTP/IMAP protocol adapters.
- **Don't build features judges won't see**: Focus 100% of energy on the omnichannel Customer 360 timeline, RBAC, and reliable deployment.

### ✅ What TO Do (Winning Strategy):
- **Leverage EspoCRM as the core foundation**.
- **Build a fast, resilient TypeScript microservice integration layer**.
- **Unify all communication channels into a single timeline**.
- **Make RBAC visibly strict and demonstrable**.
- **Use MinIO properly for S3-compatible media storage**.
- **Make Docker deployment 100% reproducible with one command**.
- **Benchmark competitors with hard facts**.

---

## 5. Judge & Sponsor Q&A Defense Cheat Sheet

### Q1: "Why not use HubSpot or Salesforce?"
> **Answer**: Cost and data privacy. Proprietary CRMs charge per user, per channel, and per gigabyte of storage, while storing sensitive customer communications on third-party servers. NexusCRM gives enterprise teams total data sovereignty, zero recurring seat licenses, and complete control over customer PII.

### Q2: "How do you handle rate limits on WhatsApp Cloud API?"
> **Answer**: Our TypeScript Integration API decouples incoming webhooks from CRM writes. Webhooks are acknowledged with HTTP 200 immediately, while messages are processed asynchronously. Outbound dispatches can be throttled through queue workers to adhere strictly to Meta's tier rate limits.

### Q3: "What prevents Broken Object Level Authorization (BOLA) attacks?"
> **Answer**: We enforce zero client trust. Every request route validates the entity type (`Contact`, `Lead`, `Account`) against a strict allowlist, validates entity IDs using regex formats, and checks authenticated user ownership in EspoCRM's permission layer before mutating or returning records.

### Q4: "How does storage scale as call recordings grow into terabytes?"
> **Answer**: Instead of bloating the MariaDB database with binary BLOBs, all call recordings and file attachments are offloaded directly to MinIO object storage. The CRM database only stores the S3 object key and signed URI metadata. MinIO can be clustered or swapped for Amazon S3, Cloudflare R2, or Ceph without changing a single line of application code.
