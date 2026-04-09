#!/bin/bash
export PATH="/usr/local/bin:$PATH"
export ANTHROPIC_API_KEY="your-anthropic-api-key-here"
cd "$(dirname "$0")"
mkdir -p logs
node server.js &
node src/index.js >> logs/cron.log 2>&1
