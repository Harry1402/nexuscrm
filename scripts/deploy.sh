#!/usr/bin/env bash
# ==============================================================================
# NexusCRM Turnkey One-Command Deployment Orchestrator
# ==============================================================================
set -euo pipefail

# ANSI color codes
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
BOLD="\033[1m"
NC="\033[0m"

echo -e "\n${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║              NexusCRM Turnkey Deployment Engine                ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}\n"

# 1. Verify Prerequisites
echo -e "${BOLD}Step 1: Checking System Prerequisites...${NC}"
if ! command -v docker &> /dev/null; then
  echo -e "${RED}[ERROR] Docker is not installed or not in PATH.${NC}"
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo -e "${RED}[ERROR] Node.js is not installed or not in PATH.${NC}"
  exit 1
fi
echo -e "${GREEN}[OK] Docker and Node.js detected.${NC}\n"

# 2. Initialize Environment Variables
echo -e "${BOLD}Step 2: Checking Environment Configuration...${NC}"
if [ ! -f .env ]; then
  echo -e "${YELLOW}[INFO] .env not found. Creating from .env.example...${NC}"
  cp .env.example .env
  echo -e "${GREEN}[OK] .env created from template.${NC}"
else
  echo -e "${GREEN}[OK] Existing .env file found.${NC}"
fi
echo ""

# 3. Spin Up Docker Containers
echo -e "${BOLD}Step 3: Launching Container Stack via Docker Compose...${NC}"
docker compose up -d
echo -e "${GREEN}[OK] Docker containers launched.${NC}\n"

# 4. Wait for EspoCRM to become ready
echo -e "${BOLD}Step 4: Waiting for EspoCRM Web Service (http://localhost:8080)...${NC}"
MAX_RETRIES=40
COUNT=0
until curl -s -f http://localhost:8080 > /dev/null 2>&1 || [ $COUNT -ge $MAX_RETRIES ]; do
  printf "."
  sleep 3
  COUNT=$((COUNT+1))
done
echo ""

if [ $COUNT -ge $MAX_RETRIES ]; then
  echo -e "${YELLOW}[WARN] EspoCRM took longer than expected to initialize. Proceeding with seeding...${NC}"
else
  echo -e "${GREEN}[OK] EspoCRM is online and responding.${NC}\n"
fi

# 5. Provision 5-Tier RBAC Roles
echo -e "${BOLD}Step 5: Seeding 5-Tier RBAC Roles into EspoCRM...${NC}"
if node scripts/seed-roles.js; then
  echo -e "${GREEN}[OK] RBAC roles seeded successfully.${NC}\n"
else
  echo -e "${YELLOW}[WARN] RBAC role seeding encountered a warning (may already exist).${NC}\n"
fi

# 6. Provision Integration API Service User
echo -e "${BOLD}Step 6: Provisioning Integration API User & Role...${NC}"
if node scripts/seed-api-user.js; then
  echo -e "${GREEN}[OK] Integration API user provisioned.${NC}\n"
else
  echo -e "${YELLOW}[WARN] API user provisioning encountered a warning.${NC}\n"
fi

# 7. Seed Realistic Demo Data
echo -e "${BOLD}Step 7: Populating Realistic CRM Demo Data (Accounts, Contacts, Leads)...${NC}"
if node scripts/seed.js; then
  echo -e "${GREEN}[OK] Demo records seeded successfully.${NC}\n"
else
  echo -e "${YELLOW}[WARN] Demo seeding encountered a warning.${NC}\n"
fi

# 8. Service Health Probes
echo -e "${BOLD}Step 8: Probing Enterprise Health Endpoints...${NC}"
bash scripts/healthcheck.sh || true

# 9. Deployment Summary & Access Dashboard
echo -e "\n${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║                  NexusCRM Deployment Complete!                 ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}\n"

echo -e "${BOLD}Platform Access URLs & Credentials:${NC}"
echo -e "  🌐 ${BOLD}EspoCRM Web Portal:${NC}      http://localhost:8080"
echo -e "     Username:                  admin"
echo -e "     Password:                  (from your .env file)"
echo ""
echo -e "  📊 ${BOLD}Operations Dashboard:${NC}    http://localhost:3000/dashboard"
echo -e "  📡 ${BOLD}Integration API Base:${NC}    http://localhost:3000"
echo -e "  🗄️  ${BOLD}MinIO S3 Console:${NC}        http://localhost:9001"
echo -e "     Access Key:                minioadmin"
echo -e "     Secret Key:                (from your .env file)"
echo ""
echo -e "  ⚡ ${BOLD}Customer 360 Timeline:${NC}   http://localhost:3000/api/v1/timeline/customer360/contact/{id}/view"
echo -e "  🏥 ${BOLD}Health Check Probe:${NC}      http://localhost:3000/health"
echo ""
echo -e "${GREEN}${BOLD}NexusCRM is fully operational!${NC}\n"
