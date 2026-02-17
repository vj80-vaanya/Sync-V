#pragma once

#include <string>
#include <map>

namespace syncv {

enum class FirmwareStatus {
    NotFound,
    Received,
    Verified,
    Applied,
    Failed
};

class FirmwareReceiver {
public:
    /// @param stagingDir Directory for incoming firmware files.
    /// @param installedDir Directory for verified/applied firmware.
    FirmwareReceiver(const std::string& stagingDir, const std::string& installedDir);

    /// Receive firmware data and write to staging directory.
    bool receive(const std::string& filename, const std::string& data);

    /// Verify integrity of staged firmware against expected SHA256 hash.
    bool verifyIntegrity(const std::string& filename, const std::string& expectedHash);

    /// Apply verified firmware (move from staging to installed).
    bool apply(const std::string& filename);

    /// Get current status of a firmware file.
    FirmwareStatus getStatus(const std::string& filename) const;

private:
    std::string stagingDir_;
    std::string installedDir_;
    std::map<std::string, FirmwareStatus> statusMap_;
};

} // namespace syncv
