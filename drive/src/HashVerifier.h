#pragma once

#include <string>
#include <cstdint>
#include <vector>
#include <array>

namespace syncv {

class HashVerifier {
public:
    /// Compute SHA256 hash of a string and return hex-encoded result.
    std::string hashString(const std::string& data);

    /// Compute SHA256 hash of a file (streaming) and return hex-encoded result.
    /// Returns empty string if file cannot be read.
    std::string hashFile(const std::string& filePath);

    /// Verify that a file's SHA256 matches the expected hash.
    bool verifyFile(const std::string& filePath, const std::string& expectedHash);

private:
    // Minimal SHA256 implementation (no external dependency)
    struct SHA256Context {
        uint32_t state[8];
        uint64_t bitcount;
        uint8_t buffer[64];
    };

    void sha256Init(SHA256Context& ctx);
    void sha256Update(SHA256Context& ctx, const uint8_t* data, size_t len);
    std::array<uint8_t, 32> sha256Final(SHA256Context& ctx);
    void sha256Transform(SHA256Context& ctx, const uint8_t block[64]);

    std::string toHex(const std::array<uint8_t, 32>& hash);
};

} // namespace syncv
