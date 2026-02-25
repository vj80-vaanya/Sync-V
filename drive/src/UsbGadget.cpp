#include "UsbGadget.h"

#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <cstdlib>
#include <cstring>

namespace fs = std::filesystem;

namespace syncv {

UsbGadget::UsbGadget(const UsbGadgetConfig& config)
    : config_(config) {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

int UsbGadget::runCommand(const std::string& cmd) const {
    return std::system(cmd.c_str());
}

bool UsbGadget::fileExists(const std::string& path) const {
    std::error_code ec;
    return fs::exists(path, ec);
}

bool UsbGadget::writeFile(const std::string& path, const std::string& content) const {
    std::ofstream out(path, std::ios::trunc);
    if (!out) return false;
    out << content;
    return out.good();
}

// ---------------------------------------------------------------------------
// Image management
// ---------------------------------------------------------------------------

bool UsbGadget::createImage() {
    if (fileExists(config_.imagePath)) {
        std::cout << "[usb] Image already exists: " << config_.imagePath << std::endl;
        return true;
    }

    // Ensure parent directory exists
    std::error_code ec;
    fs::create_directories(fs::path(config_.imagePath).parent_path(), ec);
    if (ec) {
        std::cerr << "[usb] Cannot create image dir: " << ec.message() << std::endl;
        return false;
    }

    std::ostringstream cmd;
    cmd << "dd if=/dev/zero of=" << config_.imagePath
        << " bs=1M count=" << config_.imageSizeMB
        << " status=none 2>/dev/null";

    if (runCommand(cmd.str()) != 0) {
        std::cerr << "[usb] Failed to create disk image" << std::endl;
        return false;
    }
    std::cout << "[usb] Created " << config_.imageSizeMB << " MB image" << std::endl;
    return true;
}

bool UsbGadget::formatImage() {
    std::string cmd = "mkfs.vfat -n SYNCV " + config_.imagePath + " 2>/dev/null";
    if (runCommand(cmd) != 0) {
        std::cerr << "[usb] Failed to format image as FAT32" << std::endl;
        return false;
    }
    std::cout << "[usb] Formatted image as FAT32" << std::endl;
    return true;
}

bool UsbGadget::mountImage() {
    std::error_code ec;
    fs::create_directories(config_.mountPoint, ec);
    if (ec) {
        std::cerr << "[usb] Cannot create mount point: " << ec.message() << std::endl;
        return false;
    }

    std::string cmd = "mount -o loop " + config_.imagePath + " " + config_.mountPoint + " 2>/dev/null";
    if (runCommand(cmd) != 0) {
        std::cerr << "[usb] Failed to mount image" << std::endl;
        return false;
    }
    return true;
}

bool UsbGadget::unmountImage() {
    // Sync first — flush all pending writes to the image
    runCommand("sync");

    std::string cmd = "umount " + config_.mountPoint + " 2>/dev/null";
    if (runCommand(cmd) != 0) {
        // May already be unmounted; not fatal
        return true;
    }
    return true;
}

// ---------------------------------------------------------------------------
// ConfigFS USB gadget setup
// ---------------------------------------------------------------------------

bool UsbGadget::setupConfigfs() {
    const std::string gadgetDir = "/sys/kernel/config/usb_gadget/" + config_.gadgetName;

    // If already configured, skip
    if (fileExists(gadgetDir + "/UDC")) {
        std::cout << "[usb] ConfigFS gadget already exists" << std::endl;
        return true;
    }

    // Create gadget directory structure
    std::error_code ec;
    fs::create_directories(gadgetDir, ec);
    if (ec) {
        std::cerr << "[usb] Cannot create configfs gadget — is configfs mounted? "
                  << "Run: modprobe libcomposite" << std::endl;
        return false;
    }

    // Device descriptors
    writeFile(gadgetDir + "/idVendor",  config_.vendorId);
    writeFile(gadgetDir + "/idProduct", config_.productId);
    writeFile(gadgetDir + "/bcdUSB",    "0x0200");
    writeFile(gadgetDir + "/bcdDevice", "0x0100");

    // English strings (0x409)
    const std::string strDir = gadgetDir + "/strings/0x409";
    fs::create_directories(strDir, ec);
    writeFile(strDir + "/manufacturer", config_.manufacturer);
    writeFile(strDir + "/product",      config_.product);
    writeFile(strDir + "/serialnumber", config_.serialNumber);

    // Configuration
    const std::string cfgDir = gadgetDir + "/configs/c.1";
    fs::create_directories(cfgDir, ec);
    const std::string cfgStrDir = cfgDir + "/strings/0x409";
    fs::create_directories(cfgStrDir, ec);
    writeFile(cfgStrDir + "/configuration", "Mass Storage");
    writeFile(cfgDir + "/MaxPower", "120");

    // Mass storage function
    const std::string funcDir = gadgetDir + "/functions/mass_storage.usb0";
    fs::create_directories(funcDir, ec);

    // Configure the LUN (logical unit)
    const std::string lunDir = funcDir + "/lun.0";
    // lun.0 is auto-created; set its backing file
    writeFile(lunDir + "/file",      "");  // clear first
    writeFile(lunDir + "/removable", "1"); // hotplug-friendly
    writeFile(lunDir + "/ro",        "1"); // read-only to host (we update offline)
    writeFile(lunDir + "/nofua",     "1"); // skip Force Unit Access — reduces timeouts

    // Link function into configuration
    const std::string linkPath = cfgDir + "/mass_storage.usb0";
    if (!fileExists(linkPath)) {
        std::string cmd = "ln -s " + funcDir + " " + linkPath + " 2>/dev/null";
        runCommand(cmd);
    }

    std::cout << "[usb] ConfigFS gadget skeleton created" << std::endl;
    initialized_ = true;
    return true;
}

bool UsbGadget::teardownConfigfs() {
    const std::string gadgetDir = "/sys/kernel/config/usb_gadget/" + config_.gadgetName;
    if (!fileExists(gadgetDir)) return true;

    // Disable UDC
    writeFile(gadgetDir + "/UDC", "");

    // Remove symlink
    const std::string linkPath = gadgetDir + "/configs/c.1/mass_storage.usb0";
    if (fileExists(linkPath)) {
        runCommand("rm " + linkPath + " 2>/dev/null");
    }

    // Remove directories in reverse order (configfs requires this)
    runCommand("rmdir " + gadgetDir + "/configs/c.1/strings/0x409 2>/dev/null");
    runCommand("rmdir " + gadgetDir + "/configs/c.1 2>/dev/null");
    runCommand("rmdir " + gadgetDir + "/functions/mass_storage.usb0 2>/dev/null");
    runCommand("rmdir " + gadgetDir + "/strings/0x409 2>/dev/null");
    runCommand("rmdir " + gadgetDir + " 2>/dev/null");

    std::cout << "[usb] ConfigFS gadget removed" << std::endl;
    exposed_ = false;
    initialized_ = false;
    return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

bool UsbGadget::init() {
    std::cout << "[usb] Initializing USB gadget..." << std::endl;

    // Load required kernel modules (idempotent)
    runCommand("modprobe libcomposite 2>/dev/null");
    runCommand("modprobe dwc2 2>/dev/null");

    if (!createImage())  return false;
    if (!formatImage())  return false;
    if (!setupConfigfs()) return false;

    std::cout << "[usb] USB gadget ready" << std::endl;
    return true;
}

bool UsbGadget::prepareImage(
    const std::vector<std::pair<std::string, std::string>>& files) {

    if (!mountImage()) return false;

    int copied = 0;
    for (const auto& [src, dstName] : files) {
        std::string dst = config_.mountPoint + "/" + dstName;
        std::error_code ec;
        fs::copy_file(src, dst, fs::copy_options::overwrite_existing, ec);
        if (ec) {
            std::cerr << "[usb] Copy failed: " << src << " -> " << dstName
                      << ": " << ec.message() << std::endl;
        } else {
            ++copied;
        }
    }

    // Clean files that are no longer in the source set
    std::error_code ec;
    for (auto& entry : fs::directory_iterator(config_.mountPoint, ec)) {
        if (!entry.is_regular_file()) continue;
        std::string name = entry.path().filename().string();
        bool found = false;
        for (const auto& [_, dstName] : files) {
            if (dstName == name) { found = true; break; }
        }
        if (!found) {
            fs::remove(entry.path(), ec);
        }
    }

    std::cout << "[usb] Prepared image: " << copied << "/" << files.size()
              << " files copied" << std::endl;

    if (!unmountImage()) return false;
    return true;
}

bool UsbGadget::expose() {
    const std::string gadgetDir = "/sys/kernel/config/usb_gadget/" + config_.gadgetName;
    const std::string lunFile   = gadgetDir + "/functions/mass_storage.usb0/lun.0/file";

    // Point the LUN at our image
    if (!writeFile(lunFile, config_.imagePath)) {
        std::cerr << "[usb] Cannot set LUN backing file" << std::endl;
        return false;
    }

    // Find the UDC (USB Device Controller) name
    std::string udc;
    std::error_code ec;
    for (auto& entry : fs::directory_iterator("/sys/class/udc", ec)) {
        udc = entry.path().filename().string();
        break;  // Pi Zero W has exactly one UDC
    }
    if (udc.empty()) {
        std::cerr << "[usb] No UDC found — is dwc2 loaded?" << std::endl;
        return false;
    }

    // Bind gadget to UDC
    if (!writeFile(gadgetDir + "/UDC", udc)) {
        std::cerr << "[usb] Failed to bind gadget to UDC " << udc << std::endl;
        return false;
    }

    exposed_ = true;
    std::cout << "[usb] Gadget exposed on UDC " << udc
              << " — host sees pendrive" << std::endl;
    return true;
}

bool UsbGadget::unexpose() {
    if (!exposed_) return true;

    const std::string gadgetDir = "/sys/kernel/config/usb_gadget/" + config_.gadgetName;

    // Unbind from UDC (host will see device disconnect)
    writeFile(gadgetDir + "/UDC", "");

    // Clear LUN backing file
    writeFile(gadgetDir + "/functions/mass_storage.usb0/lun.0/file", "");

    exposed_ = false;
    std::cout << "[usb] Gadget unexposed — host disconnected" << std::endl;
    return true;
}

bool UsbGadget::refresh(
    const std::vector<std::pair<std::string, std::string>>& files) {

    std::cout << "[usb] Refreshing USB drive contents..." << std::endl;

    // Step 1: Disconnect from host
    if (!unexpose()) {
        std::cerr << "[usb] Failed to unexpose — aborting refresh" << std::endl;
        return false;
    }

    // Step 2: Copy fresh files into image
    if (!prepareImage(files)) {
        std::cerr << "[usb] Failed to prepare image — re-exposing stale data" << std::endl;
        expose();  // best effort: re-expose whatever we had
        return false;
    }

    // Step 3: Re-expose to host with updated contents
    if (!expose()) {
        std::cerr << "[usb] Failed to re-expose after refresh" << std::endl;
        return false;
    }

    std::cout << "[usb] USB drive refreshed successfully" << std::endl;
    return true;
}

bool UsbGadget::isExposed() const {
    return exposed_;
}

std::string UsbGadget::getStatus() const {
    if (!initialized_) return "not initialized";
    if (exposed_)      return "exposed (host sees pendrive)";
    return "ready (not exposed)";
}

void UsbGadget::cleanup() {
    std::cout << "[usb] Cleaning up..." << std::endl;
    unexpose();
    unmountImage();
    teardownConfigfs();
    std::cout << "[usb] Cleanup complete" << std::endl;
}

} // namespace syncv
