#include "TransferManager.h"
#include <filesystem>
#include <fstream>
#include <chrono>
#include <thread>
#include <cstring>

namespace fs = std::filesystem;

namespace syncv {

TransferManager::TransferManager() {}

TransferResult TransferManager::transfer(const std::string& srcPath,
                                          const std::string& dstPath) {
    return transferWithOffset(srcPath, dstPath, 0);
}

TransferResult TransferManager::transferWithOffset(const std::string& srcPath,
                                                     const std::string& dstPath,
                                                     uint64_t offset) {
    TransferResult result;

    if (!fs::exists(srcPath)) {
        result.success = false;
        result.errorMessage = "Source file not found: " + srcPath;
        return result;
    }

    uint64_t totalSize = static_cast<uint64_t>(fs::file_size(srcPath));

    std::ifstream src(srcPath, std::ios::binary);
    if (!src.is_open()) {
        result.success = false;
        result.errorMessage = "Cannot open source file";
        return result;
    }

    // Seek to offset for resume
    if (offset > 0) {
        src.seekg(static_cast<std::streamoff>(offset));
    }

    // Open destination in append mode for resume, or write mode for fresh transfer
    std::ofstream dst;
    if (offset > 0) {
        dst.open(dstPath, std::ios::binary | std::ios::app);
    } else {
        dst.open(dstPath, std::ios::binary);
    }

    if (!dst.is_open()) {
        result.success = false;
        result.errorMessage = "Cannot open destination file";
        return result;
    }

    auto startTime = std::chrono::steady_clock::now();
    uint64_t bytesWritten = offset;
    std::vector<char> buffer(chunkSize_);

    while (src.read(buffer.data(), static_cast<std::streamsize>(chunkSize_)) || src.gcount() > 0) {
        auto bytesRead = src.gcount();
        dst.write(buffer.data(), bytesRead);

        if (!dst.good()) {
            result.success = false;
            result.errorMessage = "Write error during transfer";
            return result;
        }

        bytesWritten += static_cast<uint64_t>(bytesRead);

        if (progressCallback_ && totalSize > 0) {
            float progress = (static_cast<float>(bytesWritten) / static_cast<float>(totalSize)) * 100.0f;
            progressCallback_(progress);
        }

        if (src.eof()) break;
    }

    auto endTime = std::chrono::steady_clock::now();
    auto durationMs = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();

    result.success = true;
    result.bytesTransferred = bytesWritten;
    result.bytesPerSecond = durationMs > 0
        ? (static_cast<double>(bytesWritten) / (static_cast<double>(durationMs) / 1000.0))
        : static_cast<double>(bytesWritten);

    return result;
}

std::vector<TransferResult> TransferManager::transferBatch(
    const std::vector<std::pair<std::string, std::string>>& files) {
    std::vector<TransferResult> results;
    for (const auto& pair : files) {
        results.push_back(transfer(pair.first, pair.second));
    }
    return results;
}

void TransferManager::recordPartialTransfer(const std::string& srcPath,
                                              const std::string& dstPath,
                                              uint64_t bytesCompleted) {
    PartialTransferInfo info;
    info.srcPath = srcPath;
    info.dstPath = dstPath;
    info.bytesCompleted = bytesCompleted;
    partialTransfers_[srcPath] = info;
}

TransferResult TransferManager::resumeTransfer(const std::string& srcPath,
                                                 const std::string& dstPath) {
    auto it = partialTransfers_.find(srcPath);
    if (it == partialTransfers_.end()) {
        return transfer(srcPath, dstPath);
    }

    uint64_t offset = it->second.bytesCompleted;
    partialTransfers_.erase(it);
    return transferWithOffset(srcPath, dstPath, offset);
}

bool TransferManager::retryWithBackoff(std::function<bool()> operation) {
    for (int attempt = 0; attempt < maxRetries_; attempt++) {
        if (operation()) {
            return true;
        }

        if (attempt < maxRetries_ - 1) {
            int backoffMs = baseBackoffMs_ * (1 << attempt);
            std::this_thread::sleep_for(std::chrono::milliseconds(backoffMs));
        }
    }
    return false;
}

void TransferManager::onProgress(std::function<void(float)> callback) {
    progressCallback_ = std::move(callback);
}

void TransferManager::setMaxRetries(int retries) {
    maxRetries_ = retries;
}

void TransferManager::setBaseBackoffMs(int ms) {
    baseBackoffMs_ = ms;
}

void TransferManager::setChunkSize(size_t bytes) {
    chunkSize_ = bytes;
}

} // namespace syncv
