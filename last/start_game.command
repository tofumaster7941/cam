#!/bin/bash
cd "$(dirname "$0")"
echo "Starting game server..."
# Open browser after a slight delay to ensure server is up
(sleep 1 && open http://localhost:8000) &
python3 run_server.py
