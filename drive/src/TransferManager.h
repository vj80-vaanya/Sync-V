#pragma once

#include <string>
#include <vector>
#include <functional>
#include <cstdint>
#include <map>

namespace syncv {

struct TransferResult {
    bool success = false;
    std::string errorMessage;
    uint64_t bytesTransferred = 0;
    double bytesPerSecond = 0.0;
};

class TransferManager {
public:
    TransferManager();

    /// Transfer a file from source to destination.
    TransferResult transfer(const std::string& srcPath, const std::string& dstPath);

    /// Transfer multiple files sequentially.
    std::vector<TransferResult> transferBatch(
        const std::vector<std::pair<std::string, std::string>>& files);

    /// Record that a transfer was partially completed (for resume support).
    void recordPartialTransfer(const std::string& srcPath,
                                const std::string& dstPath,
                                uint64_t bytesCompleted);

    /// Resume a previously interrupted transfer.
    TransferResult resumeTransfer(const std::string& srcPath, const std::string& dstPath);

    /// Retry a callable with exponential backoff.
    bool retryWithBackoff(std::function<bool()> operation);

    /// Set progress callback.
    void onProgress(std::function<void(float)> callback);

    /// Configuration
    void setMaxRetries(int retries);
    void setBaseBackoffMs(int ms);
    void setChunkSize(size_t bytes);

private:
    int maxRetries_ = 3;
    int baseBackoffMs_ = 1000;
    size_t chunkSize_ = 65536; // 64KB default
    std::function<void(float)> progressCallback_;

    struct PartialTransferInfo {
        std::string srcPath;
        std::string dstPath;
        uint64_t bytesCompleted;
    };
    std::map<std::string, PartialTransferInfo> partialTransfers_;

    TransferResult transferWithOffset(const std::string& srcPath,
                                       const std::string& dstPath,
                                       uint64_t offset);
};

} // namespace syncv
