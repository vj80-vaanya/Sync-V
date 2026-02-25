#pragma once

#include <string>
#include <vector>
#include <cstdint>
#include <utility>

namespace syncv {

/// Configuration for the USB mass-storage gadget.
struct UsbGadgetConfig {
    std::string imagePath    = "/var/syncv/usb/drive.img";  // FAT32 backing file
    std::string mountPoint   = "/var/syncv/usb/mnt";        // local mount for writes
    std::string gadgetName   = "syncv";                     // configfs gadget name
    uint64_t    imageSizeMB  = 64;                          // disk image size in MB
    std::string vendorId     = "0x1d6b";                    // Linux Foundation
    std::string productId    = "0x0104";                    // Multifunction Composite
    std::string manufacturer = "SyncV";
    std::string product      = "SyncV Drive";
    std::string serialNumber = "000000000001";
};

/// Manages the Pi Zero W USB mass-storage gadget via Linux configfs.
///
/// Design: "prepare then expose" — the image is never written while
/// the host is reading.  This eliminates the USB timeout issues that
/// occur when the backing file is modified during a host transfer.
///
///   1. unexpose()        — disconnect from host
///   2. prepareImage()    — mount locally, copy fresh files, sync
///   3. expose()          — reconnect so host sees updated pendrive
///
class UsbGadget {
public:
    explicit UsbGadget(const UsbGadgetConfig& config = {});

    /// One-time setup: create image + format + configfs skeleton.
    /// Returns false if any step fails (not running as root, etc.).
    bool init();

    /// Copy files into the disk image (mounts locally, copies, syncs, unmounts).
    /// @param files  vector of (source_path, destination_filename) pairs.
    bool prepareImage(const std::vector<std::pair<std::string, std::string>>& files);

    /// Expose the image to the USB host (start gadget).
    bool expose();

    /// Disconnect from the USB host (stop gadget).
    bool unexpose();

    /// Full refresh cycle: unexpose → prepare → expose.
    bool refresh(const std::vector<std::pair<std::string, std::string>>& files);

    /// True when the gadget is actively presented to the host.
    bool isExposed() const;

    /// Human-readable status string for logging.
    std::string getStatus() const;

    /// Tear down configfs gadget and clean up mounts.
    void cleanup();

private:
    UsbGadgetConfig config_;
    bool exposed_     = false;
    bool initialized_ = false;

    bool createImage();
    bool formatImage();
    bool mountImage();
    bool unmountImage();
    bool setupConfigfs();
    bool teardownConfigfs();

    int  runCommand(const std::string& cmd) const;
    bool fileExists(const std::string& path) const;
    bool writeFile(const std::string& path, const std::string& content) const;
};

} // namespace syncv
