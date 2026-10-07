#!/usr/bin/env bash
set -euo pipefail

echo "Checking NexusCRM service health..."

# Check integration API service
curl -f -s http://localhost:3000/health > /dev/null && echo "Integration API: Healthy" || echo "Integration API: Unhealthy"

# Check EspoCRM service
curl -f -s http://localhost:8080 > /dev/null && echo "EspoCRM: Healthy" || echo "EspoCRM: Unhealthy"
