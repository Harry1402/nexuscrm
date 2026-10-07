# AGENTS.md — NexusCRM Development & Security Governance

This document establishes the governing rules, operational protocols, and security mandates for AI agents and developers working on the **NexusCRM** codebase.

---

## 1. Project Overview

**NexusCRM** is an enterprise-grade omnichannel Customer Relationship Management platform. It couples:
- **EspoCRM Core**: Modern open-source CRM engine powering business entities (Accounts, Contacts, Leads, Opportunities).
- **MariaDB Database**: High-performance relational backend configured with persistent granular Docker volumes.
- **Integration API (`integration-api`)**: TypeScript/Node.js microservice managing omnichannel communications (WhatsApp Cloud API, Twilio SMS & Voice, SMTP Email dispatch, and timeline aggregations).
- **EspoCRM Background Daemon**: Asynchronous task runner for queue processing and scheduled jobs.

---

## 2. Mandatory Security Rules & Directives

All agents and contributors **MUST** adhere to the following security rules without exception:

### 2.1 Backend-Only Validation & Zero Client Trust
- **Never trust client-side data.** All validation, authentication, and authorization must occur on the backend server.
- Never hardcode passwords, API keys, credentials, or secrets in frontend JavaScript, HTML, templates, or client bundles.
- Perform strict schema and payload validation on all incoming request bodies, headers, and query parameters before processing.

### 2.2 Broken Object Level Authorization (BOLA) Prevention
- All API endpoints must be protected against **Broken Object Level Authorization (BOLA / IDOR)**.
- Every endpoint accessing or mutating records (`/leads/:id`, `/messages/:id`, `/contacts/:id`, etc.) must verify that the requesting authenticated user has explicit ownership or role permission to access that specific resource.
- Never expose sensitive data (such as student or customer PII, phone numbers, email addresses, financial details) on public or unauthenticated endpoints.

### 2.3 Strict Parameterized Queries (SQL Injection Prevention)
- **Never use string concatenation or template literals** to construct SQL queries with user-provided data.
- All database interactions must use strictly parameterized queries, prepared statements, or a verified ORM/Query Builder to eliminate SQL Injection (SQLi) vulnerabilities.

### 2.4 Authentication & Session Cookie Hardening
- Always use **secure, HTTP-only session cookies** (`HttpOnly`, `Secure`, `SameSite=Strict`/`Lax`) for web authentication.
- **Never expose unauthenticated API endpoints** (with the sole exception of strictly verified webhook signature endpoints, e.g., WhatsApp and Twilio webhooks, and the standard `/health` status check).
- Store JWT secrets and session secrets securely; validate expiration and signature on every request.

### 2.5 Secrets & Environment Configuration
- All database URIs, JWT secrets, session keys, and external API keys (Twilio, WhatsApp, SMTP, EspoCRM) must be loaded exclusively from a `.env` file using `process.env`.
- **Never hardcode secrets anywhere in the repository.** Ensure `.env` is always included in `.gitignore`.

### 2.6 Dependency Security & Vulnerability Auditing
- When installing new npm packages for security (such as `helmet`, `bcrypt`, `jsonwebtoken`, `cors`), always inspect for known vulnerabilities (`npm audit`) and verify that versions are up to date and free of security advisories.

### 2.7 Pre-Implementation Planning Mandate
- **Before applying any code modifications or installing new packages**, you must generate a step-by-step implementation plan (**Artifact**) detailing:
  1. Exactly which files will be modified or created.
  2. What middleware and routes will be introduced.
  3. How database queries and models will be structured and parameterized.
  4. Security and authorization verifications applied.
- **Wait for explicit user approval before executing code changes or installs.**

---

## 3. Codebase Architecture Standards

### 3.1 Integration API (`integration-api/`)
- Written in **TypeScript** targeting Node.js runtime.
- Modular directory separation:
  - `src/config/`: Environment loading and validation.
  - `src/espocrm/`: EspoCRM REST API client and webhook listeners.
  - `src/whatsapp/`: WhatsApp Cloud API webhook handler and message sender.
  - `src/twilio/`: Twilio SMS and Voice dispatchers.
  - `src/email/`: SMTP transporter and transactional templates.
  - `src/timeline/`: Unified omnichannel activity aggregation.
  - `src/storage/`: Secure attachments and file management.

### 3.2 Docker & Container Conventions
- Use explicit container names and isolated network configuration.
- MariaDB uses persistent named volume `espocrm_db`.
- EspoCRM persistent volumes: `espocrm_data`, `espocrm_custom`, `espocrm_custom_client`.
- The background worker `espocrm-daemon` must run independently with entrypoint `docker-daemon.sh`.

---

## 4. Documentation & Git Guidelines
- Preserve all existing documentation and keep `README.md` and `docs/` in sync with codebase capabilities.
- Commit messages must follow Conventional Commits format (`docs:`, `feat:`, `fix:`, `chore:`, `refactor:`).
- Never commit private configuration (`.env`), database dumps, or local credential files to GitHub.
