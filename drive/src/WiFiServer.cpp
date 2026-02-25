#include "WiFiServer.h"
#include <filesystem>
#include <fstream>
#include <sstream>
#include <algorithm>

namespace fs = std::filesystem;

namespace syncv {

WiFiServer::WiFiServer(const std::string& rootDir) : rootDir_(rootDir) {}

std::vector<FileInfo> WiFiServer::getFileList() {
    std::vector<FileInfo> files;

    if (!fs::exists(rootDir_) || !fs::is_directory(rootDir_)) {
        return files;
    }

    for (const auto& entry : fs::directory_iterator(rootDir_)) {
        if (entry.is_regular_file()) {
            FileInfo info;
            info.name = entry.path().filename().string();
            info.size = static_cast<uint64_t>(entry.file_size());
            files.push_back(info);
        }
    }

    return files;
}

bool WiFiServer::isPathSafe(const std::string& filename) const {
    if (filename.empty()) return false;

    // Reject path traversal sequences
    if (filename.find("..") != std::string::npos) return false;
    if (filename.find('/') != std::string::npos) return false;
    if (filename.find('\\') != std::string::npos) return false;

    // Reject null bytes (could truncate path in C operations)
    if (filename.find('\0') != std::string::npos) return false;

    // Reject drive letters (Windows: C:, D:, etc.)
    if (filename.size() >= 2 && filename[1] == ':') return false;

    // Reject filenames starting with dot (hidden files)
    if (filename[0] == '.') return false;

    // Verify the resolved path stays within rootDir
    try {
        fs::path root = fs::canonical(rootDir_);
        fs::path target = root / filename;
        // weakly_canonical handles non-existent paths
        fs::path resolved = fs::weakly_canonical(target);
        std::string rootStr = root.string();
        std::string resolvedStr = resolved.string();
        if (resolvedStr.substr(0, rootStr.size()) != rootStr) return false;
    } catch (...) {
        return false;
    }

    return true;
}

FileResult WiFiServer::getFileContent(const std::string& filename) {
    FileResult result;

    if (!isPathSafe(filename)) {
        result.success = false;
        result.errorMessage = "Invalid filename";
        return result;
    }

    std::string fullPath = (fs::path(rootDir_) / filename).string();

    if (!fs::exists(fullPath) || !fs::is_regular_file(fullPath)) {
        result.success = false;
        result.errorMessage = "File not found";
        return result;
    }

    std::ifstream file(fullPath, std::ios::binary);
    if (!file.is_open()) {
        result.success = false;
        result.errorMessage = "Cannot open file";
        return result;
    }

    std::ostringstream ss;
    ss << file.rdbuf();
    std::string rawData = ss.str();

    // If encryption is enabled, encrypt and base64-encode
    if (encryptor_) {
        std::string ciphertext = encryptor_->encrypt(rawData);
        result.data = base64Encode(ciphertext);
    } else {
        result.data = rawData;
    }

    result.success = true;
    return result;
}

bool WiFiServer::receiveFirmware(const std::string& filename, const std::string& data) {
    if (!isPathSafe(filename) || data.empty()) {
        return false;
    }

    std::string firmwareDir = (fs::path(rootDir_) / "firmware").string();
    try {
        fs::create_directories(firmwareDir);
    } catch (const std::exception&) {
        return false;
    }

    std::string fullPath = (fs::path(firmwareDir) / filename).string();
    std::ofstream file(fullPath, std::ios::binary);
    if (!file.is_open()) return false;

    file.write(data.data(), static_cast<std::streamsize>(data.size()));
    return file.good();
}

bool WiFiServer::constantTimeCompare(const std::string& a, const std::string& b) const {
    if (a.size() != b.size()) return false;

    volatile unsigned char result = 0;
    for (size_t i = 0; i < a.size(); i++) {
        result |= static_cast<unsigned char>(a[i]) ^ static_cast<unsigned char>(b[i]);
    }
    return result == 0;
}

bool WiFiServer::authenticate(const std::string& token) {
    if (token.size() < 16) return false;
    if (authToken_.empty()) return false;

    return constantTimeCompare(token, authToken_);
}

void WiFiServer::setAuthToken(const std::string& token) {
    authToken_ = token;
}

void WiFiServer::setEncryptionKey(const std::string& hexKey) {
    // Convert hex key to raw bytes string
    std::string rawKey;
    rawKey.reserve(hexKey.size() / 2);
    for (size_t i = 0; i + 1 < hexKey.size(); i += 2) {
        unsigned int byte;
        std::sscanf(hexKey.c_str() + i, "%02x", &byte);
        rawKey.push_back(static_cast<char>(byte));
    }
    encryptor_ = std::make_unique<EncryptedStorage>(rawKey);
}

bool WiFiServer::isEncryptionEnabled() const {
    return encryptor_ != nullptr;
}

void WiFiServer::setTimeoutMs(int ms) {
    timeoutMs_ = ms;
}

int WiFiServer::getTimeoutMs() const {
    return timeoutMs_;
}

std::string WiFiServer::base64Encode(const std::string& data) {
    static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string encoded;
    const auto* bytes = reinterpret_cast<const unsigned char*>(data.data());
    size_t len = data.size();
    encoded.reserve(((len + 2) / 3) * 4);

    for (size_t i = 0; i < len; i += 3) {
        uint32_t n = static_cast<uint32_t>(bytes[i]) << 16;
        if (i + 1 < len) n |= static_cast<uint32_t>(bytes[i + 1]) << 8;
        if (i + 2 < len) n |= static_cast<uint32_t>(bytes[i + 2]);

        encoded.push_back(table[(n >> 18) & 0x3F]);
        encoded.push_back(table[(n >> 12) & 0x3F]);
        encoded.push_back((i + 1 < len) ? table[(n >> 6) & 0x3F] : '=');
        encoded.push_back((i + 2 < len) ? table[n & 0x3F] : '=');
    }

    return encoded;
}

} // namespace syncv
