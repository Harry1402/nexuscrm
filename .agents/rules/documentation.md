# NexusCRM Documentation Standards & Rules

This rule defines the documentation requirements, formatting standards, and maintenance lifecycle for the **NexusCRM** repository.

---

## 1. Documentation Principles

1. **Accuracy & Synchronicity**: Documentation must always reflect the actual codebase, environment variables, Docker configurations, and API routes. If a component changes, its corresponding documentation must be updated in the same changeset.
2. **Clarity & Depth**: Avoid superficial placeholder documentation. Each document must explain *why* an architectural choice was made, *how* it operates, and *what* configuration options are available.
3. **Security in Documentation**:
   - Never expose real credentials, secret keys, webhook secrets, or personal data (PII) in documentation or examples.
   - Always use standard dummy values (e.g., `your_twilio_account_sid`, `https://crm.example.com`, `user@example.com`).

---

## 2. Formatting & Style Standards

### 2.1 Markdown Conventions
- Use standard GitHub Flavored Markdown (GFM).
- Structure documents with clear hierarchical headings (`#`, `##`, `###`, `####`). Never skip heading levels.
- Provide tables for structured data such as environment variables, API endpoints, role permissions, and feature comparisons.
- Fenced code blocks must always specify their syntax highlighting language (e.g., `bash`, `typescript`, `json`, `yaml`, `sql`, `mermaid`).

### 2.2 Diagrams (Mermaid)
- Express architecture topology, container networking, sequence interactions, and entity relationships using Mermaid diagrams.
- Always quote labels containing special characters or punctuation (e.g., `A["MariaDB (Port 3306)"]`).

### 2.3 Callouts & Alerts
- Use standard GitHub alert blocks to emphasize important notes:
  - `> [!NOTE]` for contextual background.
  - `> [!IMPORTANT]` for essential steps or requirements.
  - `> [!WARNING]` for breaking changes or operational risks.
  - `> [!CAUTION]` for high-risk security items.

---

## 3. Required Document Structure

Every guide in the `docs/` folder should adhere to this general outline:
1. **Title and Executive Summary**: Concise statement of scope and purpose.
2. **Architecture / Conceptual Model**: Flowcharts or Mermaid diagram depicting how the component fits into NexusCRM.
3. **Configuration & Prerequisites**: Required environment variables, ports, and dependencies.
4. **Step-by-Step Guide / Specifications**: Detailed instructions or API endpoints.
5. **Security & Authorization Controls**: BOLA prevention, authentication rules, and sensitive data protections.
6. **Troubleshooting & Health Verification**: Diagnostic commands, logs, and verification checks.

---

## 4. Documentation Sitemaps
- [README.md](../../README.md): Project overview, quickstart, environment configuration, and directory roadmap.
- [docs/architecture.md](../../docs/architecture.md): Container topology, communication flow, and data storage.
- [docs/crm-comparison.md](../../docs/crm-comparison.md): Feature and architecture comparison of CRM alternatives.
- [docs/deployment.md](../../docs/deployment.md): Deployment, orchestration, persistence, and production hardening.
- [docs/integrations.md](../../docs/integrations.md): WhatsApp, Twilio, SMTP, and EspoCRM webhook specifications.
- [docs/rbac.md](../../docs/rbac.md): Role-Based Access Control, permission matrix, and BOLA defense.
