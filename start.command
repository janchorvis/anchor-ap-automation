#!/bin/bash
# Anchor AP Automation — Launch Script
# Double-click this file to start the app

cd "$(dirname "$0")"

echo "Starting Anchor AP Automation..."

# Check for Python 3
if command -v python3 &>/dev/null; then
  python3 -m http.server 8080 &
  SERVER_PID=$!
else
  echo "Python 3 not found. Please install it from python.org"
  read -p "Press Enter to exit..."
  exit 1
fi

sleep 1

# Open browser
open "http://localhost:8080/invoice-processor.html"

echo "App running at http://localhost:8080/invoice-processor.html"
echo "Press Ctrl+C to stop the server when done."

# Keep running until user quits
wait $SERVER_PID
