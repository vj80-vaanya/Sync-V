#pragma once

#include <string>
#include <vector>
#include <cstdint>

namespace syncv {

struct FileInfo {
    std::string name;
    uint64_t size = 0;
};

struct FileResult {
    bool success = false;
    std::string data;
    std::string errorMessage;
};

class WiFiServer {
public:
    /// @param rootDir The directory to serve files from.
    explicit WiFiServer(const std::string& rootDir);

    /// Get list of files available in the root directory.
    std::vector<FileInfo> getFileList();

    /// Get the content of a specific file by name.
    FileResult getFileContent(const std::string& filename);

    /// Receive firmware file from mobile and store it.
    bool receiveFirmware(const std::string& filename, const std::string& data);

    /// Authenticate a connection using a pre-shared token.
    bool authenticate(const std::string& token);

    /// Set the expected authentication token.
    void setAuthToken(const std::string& token);

    /// Set connection timeout in milliseconds.
    void setTimeoutMs(int ms);

    /// Get current timeout setting.
    int getTimeoutMs() const;

private:
    std::string rootDir_;
    std::string authToken_;
    int timeoutMs_ = 30000;

    bool isPathSafe(const std::string& filename) const;
    bool constantTimeCompare(const std::string& a, const std::string& b) const;
};

} // namespace syncv
