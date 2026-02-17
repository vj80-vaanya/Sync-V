#include "FirmwareReceiver.h"
#include "HashVerifier.h"
#include <filesystem>
#include <fstream>

namespace fs = std::filesystem;

namespace syncv {

FirmwareReceiver::FirmwareReceiver(const std::string& stagingDir,
                                     const std::string& installedDir)
    : stagingDir_(stagingDir), installedDir_(installedDir) {
    try {
        fs::create_directories(stagingDir_);
        fs::create_directories(installedDir_);
    } catch (const std::exception& e) {
        throw std::runtime_error(
            std::string("Failed to create firmware directories: ") + e.what());
    }
}

bool FirmwareReceiver::receive(const std::string& filename, const std::string& data) {
    if (data.empty()) {
        statusMap_[filename] = FirmwareStatus::Failed;
        return false;
    }

    std::string path = stagingDir_ + "/" + filename;
    std::ofstream file(path, std::ios::binary);
    if (!file.is_open()) {
        statusMap_[filename] = FirmwareStatus::Failed;
        return false;
    }

    file.write(data.data(), static_cast<std::streamsize>(data.size()));
    if (!file.good()) {
        statusMap_[filename] = FirmwareStatus::Failed;
        return false;
    }

    statusMap_[filename] = FirmwareStatus::Received;
    return true;
}

bool FirmwareReceiver::verifyIntegrity(const std::string& filename,
                                        const std::string& expectedHash) {
    std::string path = stagingDir_ + "/" + filename;

    if (!fs::exists(path)) {
        return false;
    }

    HashVerifier verifier;
    bool valid = verifier.verifyFile(path, expectedHash);

    if (valid) {
        statusMap_[filename] = FirmwareStatus::Verified;
    } else {
        statusMap_[filename] = FirmwareStatus::Failed;
    }

    return valid;
}

bool FirmwareReceiver::apply(const std::string& filename) {
    auto it = statusMap_.find(filename);
    if (it == statusMap_.end() || it->second != FirmwareStatus::Verified) {
        return false;
    }

    std::string srcPath = stagingDir_ + "/" + filename;
    std::string dstPath = installedDir_ + "/" + filename;

    try {
        fs::copy_file(srcPath, dstPath, fs::copy_options::overwrite_existing);
        statusMap_[filename] = FirmwareStatus::Applied;
        return true;
    } catch (const std::exception&) {
        statusMap_[filename] = FirmwareStatus::Failed;
        return false;
    }
}

FirmwareStatus FirmwareReceiver::getStatus(const std::string& filename) const {
    auto it = statusMap_.find(filename);
    if (it == statusMap_.end()) {
        return FirmwareStatus::NotFound;
    }
    return it->second;
}

} // namespace syncv
