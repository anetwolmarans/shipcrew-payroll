#!/bin/bash
# ShipCrew Payroll — double-click me (Mac)
cd "$(dirname "$0")"
echo ""
echo "================================================"
echo " ShipCrew Payroll — starting on this computer"
echo "================================================"
echo ""
( sleep 1; open "http://localhost:8080" ) &
echo "The app should open in your browser at http://localhost:8080"
echo "Keep this Terminal window OPEN while using the app."
echo "To stop: press Ctrl+C or close this window."
echo ""
python3 -m http.server 8080
