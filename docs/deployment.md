# NexusCRM Production Deployment Guide

This guide covers the deployment, orchestration, volume persistence, security hardening, and operational maintenance of **NexusCRM**.

---

## 1. Prerequisites & System Requirements

### 1.1 Minimum Hardware Specifications
- **CPU**: 2 vCPU cores (4 vCPU recommended for high concurrency)
- **RAM**: 4 GB (8 GB recommended for combined CRM + Integration API workloads)
- **Disk Storage**: 20 GB available SSD/NVMe storage
- **Operating System**: Linux (Ubuntu 22.04 LTS+, Debian 12+, RHEL 9+) or Windows Server with WSL2 / Docker Desktop

### 1.2 Software Requirements
- **Docker Engine**: Version 24.0 or newer
- **Docker Compose**: Version 2.20 or newer
- **Bash Shell**: For executing health check scripts
- **Node.js**: v18 LTS or v20 LTS (if running Integration API in standalone development mode)

---

## 2. Quickstart Deployment Procedure

### Step 1: Clone the Repository
```bash
git clone https://github.com/Harry1402/nexuscrm.git
cd nexuscrm
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Open `.env` in an editor and set strong, random credentials for production:
```bash
# Application Port
PORT=3000
NODE_ENV=production

# Database Settings
MARIADB_ROOT_PASSWORD=GenerateStrongRootPassword32Chars!
ESPOCRM_DATABASE_HOST=espocrm-db
ESPOCRM_DATABASE_NAME=espocrm
ESPOCRM_DATABASE_USER=espocrm
ESPOCRM_DATABASE_PASSWORD=GenerateStrongDbPassword32Chars!

# EspoCRM Admin Credentials & URLs
ESPOCRM_ADMIN_USERNAME=admin
ESPOCRM_ADMIN_PASSWORD=GenerateStrongAdminPassword32Chars!
ESPOCRM_SITE_URL=https://crm.yourdomain.com
ESPOCRM_API_URL=http://espocrm/api/v1
ESPOCRM_API_KEY=GenerateSecureRandomEspoApiKey

# Security & Session Authentication
JWT_SECRET=GenerateStrong32CharJwtSecretString!
SESSION_SECRET=GenerateStrong32CharSessionSecretString!

# Third-Party Omnichannel Credentials
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
WHATSAPP_API_KEY=EAA...your_whatsapp_cloud_token
WHATSAPP_PHONE_NUMBER_ID=100000000000000
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@yourdomain.com
SMTP_PASS=your_smtp_password
SMTP_FROM=support@yourdomain.com
```

> [!CAUTION]
> Never commit `.env` into version control. Ensure it is listed in `.gitignore`.

### Step 3: Launch Containers
Start the multi-container stack in detached mode:
```bash
docker compose up -d
```

### Step 4: Validate Service Health
Run the automated healthcheck script:
```bash
chmod +x scripts/healthcheck.sh
./scripts/healthcheck.sh
```
Or check container states directly via Docker:
```bash
docker compose ps
```
The `nexuscrm_db` container will transition to `(healthy)` via its built-in InnoDB healthcheck before `nexuscrm_espocrm` begins serving web requests.

### Step 5: Access the Web Application
Open your browser and navigate to:
```
http://localhost:8080
```
Log in using the administrator credentials configured in your `.env` file.

---

## 3. Persistent Volume Management & Backup Operations

NexusCRM maintains data durability through four dedicated Docker volumes:
1. `espocrm_db`: MariaDB transactional tables, schemas, and binary logs.
2. `espocrm_data`: Uploaded documents, attachments, and application cache.
3. `espocrm_custom`: Custom PHP backend entities, metadata, and custom routes.
4. `espocrm_custom_client`: Client-side JavaScript UI components and views.

### 3.1 MariaDB Automated Backup
To create a consistent SQL dump without stopping the database container:
```bash
docker exec nexuscrm_db mariadb-dump \
  -u root -p"$MARIADB_ROOT_PASSWORD" \
  --single-transaction --quick espocrm > "backup_espocrm_$(date +%Y%m%d_%H%M%S).sql"
```

### 3.2 Restoring MariaDB Database
To restore a database dump:
```bash
cat backup_espocrm_20260101_120000.sql | docker exec -i nexuscrm_db mariadb \
  -u root -p"$MARIADB_ROOT_PASSWORD" espocrm
```

### 3.3 File Storage Backup
Archive application data and customizations:
```bash
docker run --rm \
  -v espocrm_data:/data:ro \
  -v espocrm_custom:/custom:ro \
  -v "$(pwd)/backups":/backup \
  alpine tar -czf /backup/espocrm_files_$(date +%Y%m%d).tar.gz /data /custom
```

---

## 4. Production Security Hardening Checklist

| Security Control | Implementation | Verification |
| :--- | :--- | :--- |
| **Reverse Proxy & SSL** | Terminate TLS via Nginx / Traefik / Caddy with Let's Encrypt certificates. | All HTTP requests redirect to HTTPS (`301 Moved Permanently`). |
| **Internal DB Isolation** | Do **not** expose port 3306 on host in `docker-compose.yml`. | `nmap -p 3306 localhost` returns closed or filtered. |
| **Strict Session Cookies** | Set `HttpOnly`, `Secure`, and `SameSite=Strict` flags. | Inspect `Set-Cookie` header in browser dev tools. |
| **BOLA Defense** | Enforce tenant/owner validation on all Integration API routes. | Automated integration tests assert 403 Forbidden on cross-tenant requests. |
| **Secrets Protection** | Load all secrets strictly from environment variables via `process.env`. | Zero credentials found in code search or Git history. |
| **Resource Constraints** | Add `mem_limit: 1024m` and `cpus: 1.5` in Docker Compose for containers. | Containers do not exhaust host memory during traffic bursts. |
| **Daemon Continuity** | `espocrm-daemon` configured with `restart: unless-stopped`. | Process auto-recovers following container crashes. |

---

## 5. Reverse Proxy Configuration Example (Nginx)

Place Nginx in front of port 8080 and 3000 to manage SSL certificates and HTTP headers:

```nginx
server {
    listen 80;
    server_name crm.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name crm.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/crm.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.yourdomain.com/privkey.pem;

    client_max_body_size 50M;

    # EspoCRM Web UI & API
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Integration API
    location /integration/ {
        rewrite ^/integration/(.*)$ /$1 break;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

---

## 6. Troubleshooting Common Issues

### Issue 1: MariaDB Container Healthcheck Fails
- **Symptom**: `nexuscrm_espocrm` does not start; `docker compose ps` shows `nexuscrm_db (unhealthy)`.
- **Cause**: MariaDB initial InnoDB database creation may take longer on slow spinning disks or cold start.
- **Fix**: Check logs with `docker compose logs espocrm-db`. The `start_period: 10s` and `retries: 3` will allow sufficient initialization time.

### Issue 2: Permission Denied on `custom/` or `data/`
- **Symptom**: White screen or error 500 when saving entities in EspoCRM.
- **Cause**: PHP process running inside container needs write permission to `/var/www/html/data`.
- **Fix**: Run `docker exec -u 0 nexuscrm_espocrm chown -R www-data:www-data /var/www/html/data /var/www/html/custom`.
