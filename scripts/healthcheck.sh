#!/usr/bin/env bash
set -uo pipefail

# ANSI color formatting
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
BOLD="\033[1m"
NC="\033[0m" # No Color

API_URL="${API_URL:-http://localhost:3000}"
ESPO_URL="${ESPO_URL:-http://localhost:8080}"
MINIO_URL="${MINIO_URL:-http://localhost:9000}"

echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}          NexusCRM Enterprise Service Health Probes              ${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════════════${NC}\n"

check_endpoint() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"

  printf "  %-38s " "${name}..."
  
  status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
  
  if [ "$status_code" -eq "$expected_status" ] || [ "$status_code" -eq 200 ]; then
    echo -e "${GREEN}[OK]${NC} (HTTP ${status_code})"
    return 0
  elif [ "$status_code" -eq "000" ]; then
    echo -e "${RED}[UNREACHABLE]${NC} (Connection refused)"
    return 1
  else
    echo -e "${YELLOW}[WARN]${NC} (HTTP ${status_code})"
    return 0
  fi
}

echo -e "${BOLD}1. Integration API Probes (${API_URL}):${NC}"
check_endpoint "Root Service Discovery" "${API_URL}/"
check_endpoint "Consolidated Health (/health)" "${API_URL}/health"
check_endpoint "EspoCRM Health Probe" "${API_URL}/health/espocrm"
check_endpoint "MinIO Storage Health Probe" "${API_URL}/health/minio"
check_endpoint "Twilio Telephony Status" "${API_URL}/health/twilio"
check_endpoint "WhatsApp Cloud API Status" "${API_URL}/health/whatsapp"
check_endpoint "Email/SMTP Transport Status" "${API_URL}/health/email"

echo -e "\n${BOLD}2. Container Direct Ports:${NC}"
check_endpoint "EspoCRM Frontend (${ESPO_URL})" "${ESPO_URL}"
check_endpoint "MinIO S3 Health (${MINIO_URL})" "${MINIO_URL}/minio/health/live"

echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Health check probes completed.${NC}\n"
