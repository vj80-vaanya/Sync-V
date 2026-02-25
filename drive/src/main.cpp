#include "LogCollector.h"
#include "HashVerifier.h"
#include "MetadataExtractor.h"
#include "WiFiServer.h"
#include "FirmwareReceiver.h"
#include "TransferManager.h"
#include "UsbGadget.h"

#include <iostream>
#include <string>
#include <vector>
#include <utility>
#include <thread>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <filesystem>
#include <atomic>

namespace fs = std::filesystem;

static std::atomic<bool> running{true};

static void signalHandler(int) {
    running = false;
}

static std::string envOr(const char* name, const std::string& fallback) {
    const char* val = std::getenv(name);
    return (val && val[0]) ? std::string(val) : fallback;
}

int main() {
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);

    // Configuration from environment (or sensible defaults for Pi)
    const std::string logDir     = envOr("SYNCV_LOG_DIR",     "/var/syncv/logs");
    const std::string fwStaging  = envOr("SYNCV_FW_STAGING",  "/var/syncv/firmware/staging");
    const std::string fwInstall  = envOr("SYNCV_FW_INSTALL",  "/var/syncv/firmware/installed");
    const std::string authToken  = envOr("SYNCV_AUTH_TOKEN",   "changeme");
    const std::string encKey     = envOr("SYNCV_ENC_KEY",      "");
    const int pollSeconds        = std::atoi(envOr("SYNCV_POLL_INTERVAL", "30").c_str());

    // USB gadget config
    const bool usbEnabled        = envOr("SYNCV_USB_GADGET", "1") == "1";
    const std::string usbImage   = envOr("SYNCV_USB_IMAGE",  "/var/syncv/usb/drive.img");
    const std::string usbMount   = envOr("SYNCV_USB_MOUNT",  "/var/syncv/usb/mnt");
    const uint64_t usbSizeMB     = std::stoull(envOr("SYNCV_USB_SIZE_MB", "64"));

    // Ensure directories exist
    for (const auto& dir : {logDir, fwStaging, fwInstall}) {
        std::error_code ec;
        fs::create_directories(dir, ec);
        if (ec) {
            std::cerr << "WARN: Could not create " << dir << ": " << ec.message() << std::endl;
        }
    }

    // Initialize core components
    syncv::LogCollector    collector;
    syncv::HashVerifier    hasher;
    syncv::WiFiServer      server(logDir);
    syncv::FirmwareReceiver firmware(fwStaging, fwInstall);
    syncv::MetadataExtractor metadata;
    syncv::TransferManager transfer;

    server.setAuthToken(authToken);
    if (!encKey.empty()) {
        server.setEncryptionKey(encKey);
        std::cout << "[drive] Encryption enabled" << std::endl;
    }

    // Initialize USB gadget (Pi Zero W shows up as pendrive)
    syncv::UsbGadgetConfig usbCfg;
    usbCfg.imagePath  = usbImage;
    usbCfg.mountPoint = usbMount;
    usbCfg.imageSizeMB = usbSizeMB;
    syncv::UsbGadget usb(usbCfg);

    bool usbReady = false;
    if (usbEnabled) {
        usbReady = usb.init();
        if (!usbReady) {
            std::cerr << "[drive] USB gadget init failed — continuing WiFi-only" << std::endl;
        }
    }

    std::cout << "=============================" << std::endl;
    std::cout << "  Sync-V Drive  v1.0.0" << std::endl;
    std::cout << "=============================" << std::endl;
    std::cout << "[drive] Log dir:       " << logDir << std::endl;
    std::cout << "[drive] FW staging:    " << fwStaging << std::endl;
    std::cout << "[drive] FW installed:  " << fwInstall << std::endl;
    std::cout << "[drive] Poll interval: " << pollSeconds << "s" << std::endl;
    std::cout << "[drive] USB gadget:    " << (usbReady ? "enabled" : "disabled") << std::endl;
    std::cout << "[drive] Registered device parsers:";
    for (const auto& t : metadata.getRegisteredTypes()) std::cout << " " << t;
    std::cout << std::endl;
    std::cout << "[drive] Ready — waiting for connection" << std::endl;

    // Main loop
    while (running) {
        // Collect available log files
        auto logs = collector.collectFromDirectory(logDir, true);

        size_t totalBytes = 0;
        for (const auto& log : logs) {
            totalBytes += log.fileSize;
        }

        auto files = server.getFileList();

        std::cout << "[drive] " << logs.size() << " logs (" << totalBytes << " bytes), "
                  << files.size() << " files servable" << std::endl;

        // Refresh USB drive contents (prepare-then-expose pattern)
        if (usbReady && !logs.empty()) {
            std::vector<std::pair<std::string, std::string>> usbFiles;
            for (const auto& log : logs) {
                usbFiles.emplace_back(log.fullPath, log.filename);
            }
            // Also expose installed firmware
            std::error_code ec;
            for (auto& entry : fs::directory_iterator(fwInstall, ec)) {
                if (entry.is_regular_file()) {
                    usbFiles.emplace_back(
                        entry.path().string(),
                        "firmware/" + entry.path().filename().string());
                }
            }

            if (!usb.isExposed()) {
                // First time: prepare and expose
                usb.prepareImage(usbFiles);
                usb.expose();
            } else {
                // Subsequent: full refresh cycle (unexpose → prepare → expose)
                usb.refresh(usbFiles);
            }
            std::cout << "[drive] USB: " << usb.getStatus() << std::endl;
        }

        // Sleep in small increments so SIGTERM is responsive
        for (int i = 0; i < pollSeconds && running; ++i) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }
    }

    // Graceful shutdown
    if (usbReady) {
        usb.cleanup();
    }

    std::cout << "[drive] Shutting down" << std::endl;
    return 0;
}
