#!/bin/bash
# Sync-V Drive — Raspberry Pi Zero W setup script
# Run on the Pi: bash setup-pi.sh <path-to-syncv-drive-binary>
set -euo pipefail

BINARY="${1:?Usage: setup-pi.sh <path-to-syncv-drive-binary>}"

echo "=== Sync-V Drive — Pi Zero W Setup ==="

# Create directories
sudo mkdir -p /var/syncv/{logs,firmware/staging,firmware/installed,usb/mnt}
sudo chown pi:pi /var/syncv -R
echo "[ok] Created /var/syncv directories"

# Install binary
sudo cp "$BINARY" /usr/local/bin/syncv-drive
sudo chmod 755 /usr/local/bin/syncv-drive
echo "[ok] Installed binary to /usr/local/bin/syncv-drive"

# --- USB Gadget Mode Setup ---
echo ""
echo "--- Configuring USB gadget mode ---"

# Enable dwc2 overlay in config.txt (Pi Zero W USB OTG)
CONFIG_TXT="/boot/config.txt"
if [ -f "/boot/firmware/config.txt" ]; then
    CONFIG_TXT="/boot/firmware/config.txt"  # Bookworm uses /boot/firmware/
fi

if ! grep -q "^dtoverlay=dwc2" "$CONFIG_TXT" 2>/dev/null; then
    echo "dtoverlay=dwc2" | sudo tee -a "$CONFIG_TXT" > /dev/null
    echo "[ok] Added dwc2 overlay to $CONFIG_TXT"
else
    echo "[ok] dwc2 overlay already in $CONFIG_TXT"
fi

# Load dwc2 module at boot
if ! grep -q "^dwc2" /etc/modules 2>/dev/null; then
    echo "dwc2" | sudo tee -a /etc/modules > /dev/null
    echo "[ok] Added dwc2 to /etc/modules"
else
    echo "[ok] dwc2 already in /etc/modules"
fi

# Ensure libcomposite is loaded at boot (for configfs USB gadgets)
if ! grep -q "^libcomposite" /etc/modules 2>/dev/null; then
    echo "libcomposite" | sudo tee -a /etc/modules > /dev/null
    echo "[ok] Added libcomposite to /etc/modules"
else
    echo "[ok] libcomposite already in /etc/modules"
fi

# Load modules now (so we don't need reboot for first test)
sudo modprobe dwc2 2>/dev/null || echo "[warn] dwc2 module not available yet (reboot needed)"
sudo modprobe libcomposite 2>/dev/null || echo "[warn] libcomposite not available yet (reboot needed)"

echo "[ok] USB gadget modules configured"

# --- Install systemd service ---
echo ""
echo "--- Installing systemd service ---"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/syncv-drive.service" ]; then
    sudo cp "$SCRIPT_DIR/syncv-drive.service" /etc/systemd/system/
else
    sudo cp "$(dirname "$BINARY")/deploy/syncv-drive.service" /etc/systemd/system/ 2>/dev/null || {
        echo "[warn] syncv-drive.service not found — copy it manually to /etc/systemd/system/"
    }
fi

sudo systemctl daemon-reload
sudo systemctl enable syncv-drive
sudo systemctl start syncv-drive
echo "[ok] Service enabled and started"

echo ""
echo "=== Done ==="
echo "Check status:  sudo systemctl status syncv-drive"
echo "View logs:     journalctl -u syncv-drive -f"
echo ""
echo "Configure auth token in /etc/systemd/system/syncv-drive.service"
echo "  then: sudo systemctl daemon-reload && sudo systemctl restart syncv-drive"
echo ""
echo "NOTE: A reboot is recommended to fully activate USB gadget mode."
echo "  After reboot, the Pi will appear as a USB pendrive when plugged in."
