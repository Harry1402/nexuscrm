# NexusCRM Performance & Scalability Rules

This rule defines the performance, throughput, and resource optimization guidelines for **NexusCRM** services, databases, and container workloads.

---

## 1. Database Optimization (MariaDB)

### 1.1 Indexing & Query Design
- **Index All Filtered Fields**: Ensure indexes exist for frequently queried columns, specifically foreign keys (`account_id`, `contact_id`, `lead_id`), status columns, and timestamp fields (`created_at`, `updated_at`).
- **Composite Indexes**: Use composite indexes for queries filtering across tenant ID/owner ID and timestamps (e.g., `(assigned_user_id, created_at)`).
- **Parameterized Queries**: Always use parameterized queries not only for SQL injection defense, but also to enable query plan caching in the MariaDB query engine.
- **Avoid Wildcard Full-Table Scans**: Prohibit leading wildcard queries (e.g., `LIKE '%keyword%'`) on unindexed text fields without fulltext indexes.

### 1.2 Connection Pooling
- Configure connection pools with bounded sizes (e.g., `connectionLimit: 20` per instance) to prevent database exhaustion under high concurrency.
- Enable automatic connection recycling and keepalive pings to handle idle socket drops.

---

## 2. Container & Storage Performance

### 2.1 Granular Volume Strategy
- Use named Docker volumes (`espocrm_db`, `espocrm_data`, `espocrm_custom`, `espocrm_custom_client`) instead of host-mounted filesystem paths for database and PHP cache storage to prevent severe I/O degradation, especially on Windows/macOS Docker Desktop filesystems.
- Isolate the MariaDB data directory on high-speed NVMe storage in production environments.

### 2.2 Background Task Offloading
- Long-running operations (mass email campaigns, WhatsApp bulk broadcasts, report generation, webhook replay) must **never** block synchronous HTTP request cycles.
- Offload background jobs exclusively to the `espocrm-daemon` worker container or asynchronous job queues.
- Ensure `espocrm-daemon` is monitored and restarted via `restart: unless-stopped`.

---

## 3. Integration API Throughput & Networking

### 3.1 Non-Blocking Asynchronous Operations
- All outgoing HTTP requests to external third-party providers (Twilio API, Meta WhatsApp Cloud API, SMTP mail server) must be non-blocking `async/await` operations with explicit timeouts (maximum 5-10s timeout per call).
- Implement exponential backoff retry algorithms for external network failures to prevent thundering herd problems.

### 3.2 Pagination & Payload Restraints
- **Mandatory Pagination**: All list endpoints (`GET /api/v1/contacts`, `GET /api/v1/messages`, `GET /api/v1/leads`) must enforce mandatory pagination with a hard upper limit (e.g., default 20 items, maximum 100 items per request).
- Prohibit unbounded queries (`SELECT * FROM table` without `LIMIT`).

### 3.3 Webhook Ingestion Rate Limiting
- Webhook endpoints (`/webhook/whatsapp`, `/webhook/twilio`, `/webhook/espocrm`) must respond with `200 OK` or `202 Accepted` immediately upon signature verification, delegating message processing to an internal asynchronous queue or worker to prevent webhook timeouts from upstream providers.
