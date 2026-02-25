# Deploying Sync-V Drive on Raspberry Pi Zero W

## Overview

The Sync-V Drive runs on a Pi Zero W and does two things:
1. **Collects** industrial device logs and firmware into `/var/syncv/`
2. **Exposes** them as a USB pendrive (mass storage gadget) when plugged into any computer

The Pi shows up as a removable drive — no drivers, no software needed on the host.

---

## Prerequisites

| Item | Notes |
|------|-------|
| Raspberry Pi Zero W | Must be the **W** variant (has WiFi + USB OTG) |
| microSD card | 8 GB+ with Raspberry Pi OS Lite (Bookworm or Bullseye) |
| USB data cable | micro-USB to USB-A (data cable, not charge-only) |
| Docker | On your build machine (Windows/Mac/Linux) for cross-compilation |

---

## Step 1: Cross-Compile the Binary

You cannot compile on the Pi Zero W itself (too slow, 512 MB RAM). Build on your dev machine using Docker:

```bash
cd drive/

# Build the ARM binary inside Docker
docker build -f Dockerfile.pi -t syncv-drive-pi .

# Extract the binary
docker run --rm syncv-drive-pi cat /out/syncv-drive > syncv-drive
chmod +x syncv-drive
```

This produces a single static binary `syncv-drive` targeting ARMv6 (Pi Zero W).

### Alternative: Native Cross-Compile (Linux only)

If you have the ARM toolchain installed (`sudo apt install gcc-arm-linux-gnueabihf g++-arm-linux-gnueabihf`):

```bash
cd drive/
cmake -B build-pi \
    -DCMAKE_TOOLCHAIN_FILE=cmake/arm-linux-gnueabihf.cmake \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_TESTING=OFF

cmake --build build-pi --target syncv_drive_bin -j$(nproc)
# Binary at: build-pi/syncv-drive
```

---

## Step 2: Copy Files to the Pi

Connect the Pi to your network via WiFi (or plug in via USB and SSH over `raspberrypi.local`):

```bash
PI_IP=raspberrypi.local  # or use the IP address

# Copy binary
scp syncv-drive pi@$PI_IP:/home/pi/

# Copy deploy scripts
scp deploy/setup-pi.sh deploy/syncv-drive.service pi@$PI_IP:/home/pi/
```

---

## Step 3: Run the Setup Script

SSH into the Pi and run:

```bash
ssh pi@$PI_IP
bash setup-pi.sh /home/pi/syncv-drive
```

The script does the following automatically:

1. Creates `/var/syncv/{logs,firmware/staging,firmware/installed,usb/mnt}`
2. Installs the binary to `/usr/local/bin/syncv-drive`
3. Enables the `dwc2` device-tree overlay in `/boot/config.txt`
4. Adds `dwc2` and `libcomposite` to `/etc/modules`
5. Installs and starts the `syncv-drive` systemd service

**Reboot** after setup to activate USB gadget mode:

```bash
sudo reboot
```

---

## Step 4: Verify

After reboot, check the service:

```bash
sudo systemctl status syncv-drive
journalctl -u syncv-drive -f
```

You should see:

```
=============================
  Sync-V Drive  v1.0.0
=============================
[drive] Log dir:       /var/syncv/logs
[drive] FW staging:    /var/syncv/firmware/staging
[drive] FW installed:  /var/syncv/firmware/installed
[drive] Poll interval: 30s
[drive] USB gadget:    enabled
[drive] Ready — waiting for connection
```

Now plug the Pi's **USB data port** (not the power port) into a computer. It should appear as a removable drive labeled **SYNCV**.

---

## How USB Gadget Mode Works

The Pi uses Linux's configfs USB gadget framework to present a FAT32 disk image as a read-only USB mass storage device.

### The "Prepare Then Expose" Pattern

This is what prevents the timeout issues:

```
 Host computer                    Pi Zero W
 ─────────────                    ─────────
                                  1. unexpose()
    [drive disconnects]              ← unbind UDC
                                  2. prepareImage()
                                     ← mount image locally
                                     ← copy fresh log files
                                     ← sync (flush all writes)
                                     ← unmount
                                  3. expose()
    [drive reconnects]               ← bind UDC
    [sees updated files]
```

The image is **never written while the host is reading**. The host sees a clean disconnect/reconnect with updated files. The image is also marked read-only (`ro=1`) and has Force Unit Access disabled (`nofua=1`), which eliminates USB command timeouts.

### Refresh Cycle

Every poll interval (default 30s), the drive:
1. Collects all log files from `/var/syncv/logs/`
2. Lists installed firmware from `/var/syncv/firmware/installed/`
3. Runs the full refresh cycle (unexpose → prepare → expose)

The host sees a brief disconnect/reconnect. Most operating systems handle this gracefully — the drive re-appears within 1-2 seconds.

---

## Configuration

All settings are via environment variables in the systemd service file:

```bash
sudo nano /etc/systemd/system/syncv-drive.service
```

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNCV_LOG_DIR` | `/var/syncv/logs` | Where industrial device logs are stored |
| `SYNCV_FW_STAGING` | `/var/syncv/firmware/staging` | Incoming firmware (unverified) |
| `SYNCV_FW_INSTALL` | `/var/syncv/firmware/installed` | Verified firmware |
| `SYNCV_AUTH_TOKEN` | `changeme` | WiFi auth token (change this!) |
| `SYNCV_ENC_KEY` | *(empty)* | AES-256-CBC key (hex). Empty = no encryption |
| `SYNCV_POLL_INTERVAL` | `30` | Seconds between poll/refresh cycles |

### USB Gadget Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNCV_USB_GADGET` | `1` | `1` = enable USB pendrive, `0` = WiFi only |
| `SYNCV_USB_IMAGE` | `/var/syncv/usb/drive.img` | Path to FAT32 disk image |
| `SYNCV_USB_MOUNT` | `/var/syncv/usb/mnt` | Temp mount point for writing files |
| `SYNCV_USB_SIZE_MB` | `64` | Disk image size in MB |

After editing, reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart syncv-drive
```

---

## Directory Layout on the Pi

```
/usr/local/bin/syncv-drive          # binary
/etc/systemd/system/syncv-drive.service

/var/syncv/
├── logs/                           # collected device logs
├── firmware/
│   ├── staging/                    # incoming firmware (unverified)
│   └── installed/                  # verified firmware
└── usb/
    ├── drive.img                   # 64 MB FAT32 image (the pendrive)
    └── mnt/                        # temporary mount point
```

### What the Host Sees on the Pendrive

```
SYNCV (D:) or /Volumes/SYNCV
├── device-001.log
├── device-002.log
├── sensor-data-2026-02-25.csv
└── firmware/
    └── v1.2.3.bin
```

---

## Updating the Binary

```bash
# On your dev machine
cd drive/
docker build -f Dockerfile.pi -t syncv-drive-pi .
docker run --rm syncv-drive-pi cat /out/syncv-drive > syncv-drive

# Copy to Pi
scp syncv-drive pi@$PI_IP:/home/pi/

# On the Pi
ssh pi@$PI_IP
sudo systemctl stop syncv-drive
sudo cp /home/pi/syncv-drive /usr/local/bin/syncv-drive
sudo chmod 755 /usr/local/bin/syncv-drive
sudo systemctl start syncv-drive
```

---

## Disabling USB Gadget Mode

If you only want WiFi transfers (no pendrive):

```bash
# In the service file, change:
Environment=SYNCV_USB_GADGET=0

sudo systemctl daemon-reload
sudo systemctl restart syncv-drive
```

The drive will still collect logs and serve them over WiFi to the mobile app.

---

## Troubleshooting

### Pi doesn't show up as a USB drive

1. Make sure you're using the **data USB port** (the one closer to the HDMI port), not the power-only port
2. Use a **data cable**, not a charge-only cable
3. Verify modules are loaded:
   ```bash
   lsmod | grep dwc2
   lsmod | grep libcomposite
   ```
4. Check if configfs is mounted:
   ```bash
   ls /sys/kernel/config/usb_gadget/
   ```
5. Check service logs:
   ```bash
   journalctl -u syncv-drive -e
   ```

### USB timeouts / transfer errors

This should not happen with the "prepare then expose" pattern. If it does:

1. Increase poll interval to reduce refresh frequency:
   ```
   Environment=SYNCV_POLL_INTERVAL=60
   ```
2. Reduce image size if logs are small:
   ```
   Environment=SYNCV_USB_SIZE_MB=32
   ```
3. Check the Pi's power supply — USB timeouts often come from insufficient power. Use a good 5V/2A adapter.

### Service won't start

```bash
# Check for errors
journalctl -u syncv-drive -e --no-pager

# Run manually for debugging
sudo /usr/local/bin/syncv-drive
```

### Permission denied on configfs

The service must run as `root` (already set in the service file). USB gadget configuration requires root access for `mount`, `modprobe`, and writing to `/sys/kernel/config/`.

---

## Hardware Wiring

```
                    Pi Zero W
              ┌──────────────────┐
              │  ┌──┐            │
              │  │SD│            │
  Power ──────┤  └──┘    [WiFi] │
  (5V/2A)     │                  │
              │    USB    HDMI   │
  Host PC ────┤   (data)        │
  (shows as   └──────────────────┘
   pendrive)

  The data USB port is the one closer to the HDMI port.
  The outer port is power-only.
```

---

## Security Checklist

Before deploying to production:

- [ ] Change `SYNCV_AUTH_TOKEN` from `changeme` to a strong random token (32+ chars)
- [ ] Set `SYNCV_ENC_KEY` to a 64-char hex string for AES-256-CBC encryption
- [ ] Use `/etc/syncv.env` with `EnvironmentFile=` instead of inline `Environment=` for secrets
- [ ] Restrict SSH access (key-only, disable password auth)
- [ ] Set a static IP or use mDNS for the Pi's WiFi
