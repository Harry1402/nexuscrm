# NexusCRM System Architecture

This document provides a comprehensive technical overview of the **NexusCRM** architecture, detailing container topology, component responsibilities, network data flows, persistent storage models, and security boundaries.

---

## 1. High-Level Architecture Overview

NexusCRM is an enterprise-ready, modular Customer Relationship Management solution designed for high availability, low latency, and secure omnichannel communication. It cleanly separates core CRM entity lifecycle management from high-throughput third-party integration pipelines, and object storage from relational data.

```mermaid
flowchart TB
    subgraph Clients["Clients & Users"]
        WebBrowser["Web Browser (Admin & Agents)"]
        MobileClient["Mobile App / API Clients"]
    end

    subgraph Edge["Network Edge / Entrypoints"]
        Port8080["Port :8080 (EspoCRM Web & REST)"]
        Port3000["Port :3000 (Integration API)"]
        Port9000["Port :9000 (MinIO S3 API)"]
        Port9001["Port :9001 (MinIO Console)"]
    end

    subgraph Containers["Docker Container Topology"]
        EspoApp["nexuscrm_espocrm\n(EspoCRM Web Application)"]
        EspoDaemon["nexuscrm_daemon\n(Asynchronous Job Worker)"]
        IntegrationService["nexus-crm-integration-api\n(TypeScript Microservice)"]
        MariaDB["nexuscrm_db\n(MariaDB 11+ InnoDB)"]
        MinIO["nexuscrm_minio\n(MinIO Object Storage)"]
    end

    subgraph Volumes["Named Granular Persistent Volumes"]
        VolDB[("espocrm_db\n/var/lib/mysql")]
        VolData[("espocrm_data\n/var/www/html/data")]
        VolCustom[("espocrm_custom\n/var/www/html/custom")]
        VolClient[("espocrm_custom_client\n/var/www/html/client/custom")]
        VolMinio[("minio_data\n/data")]
    end

    subgraph Providers["External Third-Party Gateways"]
        WhatsApp["Meta WhatsApp Cloud API"]
        Twilio["Twilio SMS & Voice API"]
        SMTP["SMTP Mail Server"]
    end

    WebBrowser --> Port8080 --> EspoApp
    MobileClient --> Port3000 --> IntegrationService

    Port9000 --> MinIO
    Port9001 --> MinIO

    EspoApp --> MariaDB
    EspoDaemon --> MariaDB
    IntegrationService <--> EspoApp
    IntegrationService --> MinIO

    MariaDB --- VolDB
    EspoApp --- VolData
    EspoApp --- VolCustom
    EspoApp --- VolClient
    EspoDaemon --- VolData
    EspoDaemon --- VolCustom
    EspoDaemon --- VolClient
    MinIO --- VolMinio

    IntegrationService <--> WhatsApp
    IntegrationService <--> Twilio
    IntegrationService --> SMTP
```

---

## 2. Core Components

### 2.1 EspoCRM Core Web Application (`nexuscrm_espocrm`)
- **Image**: `espocrm/espocrm:latest`
- **Role**: Serves the responsive single-page application (SPA) frontend and provides the core REST API for CRM entity management (Leads, Contacts, Accounts, Opportunities, Tasks, Activities).
- **Runtime**: PHP 8.x running under Apache with opcode caching enabled.
- **Port**: Exposed to host on `8080:80`.
- **Health Dependency**: Awaits `espocrm-db` in healthy status before boot.

### 2.2 MariaDB Relational Database (`nexuscrm_db`)
- **Image**: `mariadb:latest`
- **Role**: Primary ACID-compliant persistent relational store for all CRM entities.
- **Storage Engine**: InnoDB with utf8mb4 collation.
- **Healthcheck**: Uses native `healthcheck.sh --connect --innodb_initialized` every 20s with 10s start period to ensure zero-downtime container sequencing.
- **Port**: Internal only (port `3306` isolated within the Docker bridge network; never exposed to the public internet).

### 2.3 EspoCRM Daemon Worker (`nexuscrm_daemon`)
- **Image**: `espocrm/espocrm:latest` with entrypoint `docker-daemon.sh`
- **Role**: Continuously processes background jobs, workflow triggers, notification dispatch, scheduled emails, and CRM maintenance routines without degrading web request performance.
- **Dependencies**: Depends on the primary `espocrm` container.

### 2.4 MinIO Object Storage (`nexuscrm_minio`)
- **Image**: `cgr.dev/chainguard/minio:latest`
- **Role**: S3-compatible binary object store for call recordings, file attachments, and customer documents. Accessed by the Integration API via AWS SDK v3 (`@aws-sdk/client-s3`) with path-style addressing.
- **Ports**: `9000:9000` (S3 API), `9001:9001` (Web Console).
- **Bucket**: `crm-files` with logical prefixes: `attachments/`, `call-recordings/`, `documents/`.
- **Volume**: `minio_data` persistent named Docker volume.
- **Credentials**: Sourced exclusively from `.env` (`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`).

### 2.5 Integration API (`nexus-crm-integration-api`)
- **Technology**: Node.js 20+ & TypeScript 7.x with Express 5 framework.
- **Port**: `3000:3000`
- **Directory**: `integration-api/`
- **Authentication**: Authenticates to EspoCRM via a dedicated least-privilege API user (`nexus-integration`) using the `X-Api-Key` header. API key stored in `.env` as `ESPOCRM_API_KEY`.
- **Modules**:
  - `src/config/env.ts` — Zod-validated runtime environment configuration; fails fast on missing secrets.
  - `src/whatsapp/` — Meta webhook GET verification + POST inbound message ingestion with payload parsing.
  - `src/twilio/` — Twilio SMS/Voice webhook listeners and outbound SMS dispatcher.
  - `src/email/` — Transactional SMTP email dispatcher.
  - `src/timeline/` — Normalized cross-channel `TimelineEvent` model (`WHATSAPP`, `SMS`, `CALL`, `EMAIL`).
  - `src/espocrm/client.ts` — Axios REST client with entity helpers: `findContactByPhone`, `findContactByEmail`, `findLeadByPhone`, `createLead`, `createCall`, `createMessage`, `createCommunication`, `createAttachment`.
  - `src/storage/minio.ts` — S3Client with `uploadFile`, `getFile`, `checkStorageHealth`.
  - `src/server.ts` — Express app with CORS, JSON+urlencoded parsers, `/health` endpoint, global error handler.

---

## 3. Data & Communication Flows

### 3.1 Inbound Omnichannel Message Flow

```mermaid
sequenceDiagram
    autonumber
    participant Cust as Customer
    participant Ext as Gateway (WhatsApp / Twilio)
    participant API as Integration API (:3000)
    participant Espo as EspoCRM API (:8080)
    participant DB as MariaDB (:3306)
    participant S3 as MinIO (:9000)

    Cust->>Ext: Sends Message (WhatsApp / SMS)
    Ext->>API: POST /api/v1/{channel}/webhook (with HMAC signature)
    Note over API: 1. Verify webhook signature<br/>2. Validate payload schema (Zod)
    API-->>Ext: 200 OK (Immediate Ack)
    API->>Espo: GET /api/v1/Contact?where[phone]={number} (X-Api-Key)
    Espo->>DB: Parameterized query — contact by phone
    DB-->>Espo: Contact Record / null
    alt Contact Not Found — auto-create lead
        API->>Espo: POST /api/v1/Lead {source: "WhatsApp"}
        Espo->>DB: INSERT Lead (parameterized)
    end
    API->>Espo: POST /api/v1/Note (createCommunication)
    Espo->>DB: Store activity linked to Lead/Contact
```

### 3.2 Call Recording Storage Flow

```mermaid
sequenceDiagram
    autonumber
    participant Twilio
    participant API as Integration API (:3000)
    participant S3 as MinIO (:9000)
    participant Espo as EspoCRM API (:8080)

    Twilio->>API: POST /api/v1/twilio/recording (RecordingUrl, Duration)
    API->>Twilio: Download audio file (MP3)
    API->>S3: uploadFile("call-recordings/{date}/{id}.mp3", buffer)
    S3-->>API: Upload confirmed
    API->>Espo: POST /api/v1/Call (duration, recordingUrl=minio_key)
    Espo-->>API: 201 Created
```

### 3.3 Outbound Agent Communication Flow
When an agent replies from the CRM interface:
1. An EspoCRM webhook or API trigger notifies the Integration API with the target recipient and content.
2. The Integration API validates agent permissions and ensures recipient consent.
3. The message is dispatched to the corresponding provider gateway (Twilio, WhatsApp, or SMTP).
4. Status callbacks (Delivered, Read, Failed) are received asynchronously and recorded via `createCommunication()`.

---

## 4. Volume Architecture & Persistence

| Volume Name | Container Path | Purpose |
| :--- | :--- | :--- |
| `espocrm_db` | `/var/lib/mysql` | MariaDB relational database files and InnoDB logs |
| `espocrm_data` | `/var/www/html/data` | Configuration files, file uploads, and session caches |
| `espocrm_custom` | `/var/www/html/custom` | Backend PHP extensions, custom entities, and metadata |
| `espocrm_custom_client` | `/var/www/html/client/custom` | Client frontend customizations, custom views, and assets |
| `minio_data` | `/data` | MinIO binary object storage (call recordings, attachments, documents) |

---

## 5. Security & Isolation Architecture

1. **Network Boundary**: The database container (`nexuscrm_db`) is never mapped to a host port, restricting access solely to sibling containers on the internal bridge network.
2. **Secrets Decoupling**: Passwords and secrets are injected via `.env` → Docker Compose `environment:` blocks and `process.env`. Zod validates all variables at Integration API startup.
3. **Least-Privilege API Access**: The Integration API authenticates to EspoCRM using a dedicated `nexus-integration` API user scoped only to the entities it needs (Contact, Account, Lead, Opportunity, Call, Email, Note, Attachment).
4. **Authorization Layer**: Every endpoint across EspoCRM and the Integration API enforces Role-Based Access Control (RBAC) and Broken Object Level Authorization (BOLA) verification before querying data.
5. **Webhook Signature Verification**: WhatsApp HMAC-SHA256 (`X-Hub-Signature-256`) and Twilio request signatures are verified before any payload processing begins.
