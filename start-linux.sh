#!/bin/bash
# ShipCrew Payroll — run me (Linux)
cd "$(dirname "$0")"
echo ""
echo "================================================"
echo " ShipCrew Payroll — starting on this computer"
echo "================================================"
echo ""
( sleep 1; xdg-open "http://localhost:8080" 2>/dev/null || echo "Open http://localhost:8080 in your browser") &
echo "Keep this Terminal window OPEN while using the app."
echo "To stop: press Ctrl+C."
echo ""
python3 -m http.server 8080
