#include "HashVerifier.h"
#include <fstream>
#include <cstring>
#include <sstream>
#include <iomanip>

namespace syncv {

// SHA256 constants
static const uint32_t K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
};

static inline uint32_t rotr(uint32_t x, uint32_t n) {
    return (x >> n) | (x << (32 - n));
}

static inline uint32_t ch(uint32_t x, uint32_t y, uint32_t z) {
    return (x & y) ^ (~x & z);
}

static inline uint32_t maj(uint32_t x, uint32_t y, uint32_t z) {
    return (x & y) ^ (x & z) ^ (y & z);
}

static inline uint32_t sigma0(uint32_t x) {
    return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22);
}

static inline uint32_t sigma1(uint32_t x) {
    return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25);
}

static inline uint32_t gamma0(uint32_t x) {
    return rotr(x, 7) ^ rotr(x, 18) ^ (x >> 3);
}

static inline uint32_t gamma1(uint32_t x) {
    return rotr(x, 17) ^ rotr(x, 19) ^ (x >> 10);
}

void HashVerifier::sha256Init(SHA256Context& ctx) {
    ctx.state[0] = 0x6a09e667;
    ctx.state[1] = 0xbb67ae85;
    ctx.state[2] = 0x3c6ef372;
    ctx.state[3] = 0xa54ff53a;
    ctx.state[4] = 0x510e527f;
    ctx.state[5] = 0x9b05688c;
    ctx.state[6] = 0x1f83d9ab;
    ctx.state[7] = 0x5be0cd19;
    ctx.bitcount = 0;
    std::memset(ctx.buffer, 0, 64);
}

void HashVerifier::sha256Transform(SHA256Context& ctx, const uint8_t block[64]) {
    uint32_t w[64];

    for (int i = 0; i < 16; i++) {
        w[i] = (static_cast<uint32_t>(block[i * 4]) << 24) |
               (static_cast<uint32_t>(block[i * 4 + 1]) << 16) |
               (static_cast<uint32_t>(block[i * 4 + 2]) << 8) |
               (static_cast<uint32_t>(block[i * 4 + 3]));
    }

    for (int i = 16; i < 64; i++) {
        w[i] = gamma1(w[i - 2]) + w[i - 7] + gamma0(w[i - 15]) + w[i - 16];
    }

    uint32_t a = ctx.state[0], b = ctx.state[1], c = ctx.state[2], d = ctx.state[3];
    uint32_t e = ctx.state[4], f = ctx.state[5], g = ctx.state[6], h = ctx.state[7];

    for (int i = 0; i < 64; i++) {
        uint32_t t1 = h + sigma1(e) + ch(e, f, g) + K[i] + w[i];
        uint32_t t2 = sigma0(a) + maj(a, b, c);
        h = g; g = f; f = e; e = d + t1;
        d = c; c = b; b = a; a = t1 + t2;
    }

    ctx.state[0] += a; ctx.state[1] += b; ctx.state[2] += c; ctx.state[3] += d;
    ctx.state[4] += e; ctx.state[5] += f; ctx.state[6] += g; ctx.state[7] += h;
}

void HashVerifier::sha256Update(SHA256Context& ctx, const uint8_t* data, size_t len) {
    size_t bufferIdx = static_cast<size_t>((ctx.bitcount / 8) % 64);
    ctx.bitcount += static_cast<uint64_t>(len) * 8;

    for (size_t i = 0; i < len; i++) {
        ctx.buffer[bufferIdx++] = data[i];
        if (bufferIdx == 64) {
            sha256Transform(ctx, ctx.buffer);
            bufferIdx = 0;
        }
    }
}

std::array<uint8_t, 32> HashVerifier::sha256Final(SHA256Context& ctx) {
    size_t bufferIdx = static_cast<size_t>((ctx.bitcount / 8) % 64);

    ctx.buffer[bufferIdx++] = 0x80;

    if (bufferIdx > 56) {
        std::memset(ctx.buffer + bufferIdx, 0, 64 - bufferIdx);
        sha256Transform(ctx, ctx.buffer);
        bufferIdx = 0;
    }

    std::memset(ctx.buffer + bufferIdx, 0, 56 - bufferIdx);

    uint64_t bits = ctx.bitcount;
    for (int i = 7; i >= 0; i--) {
        ctx.buffer[56 + (7 - i)] = static_cast<uint8_t>(bits >> (i * 8));
    }

    sha256Transform(ctx, ctx.buffer);

    std::array<uint8_t, 32> hash;
    for (int i = 0; i < 8; i++) {
        hash[i * 4]     = static_cast<uint8_t>(ctx.state[i] >> 24);
        hash[i * 4 + 1] = static_cast<uint8_t>(ctx.state[i] >> 16);
        hash[i * 4 + 2] = static_cast<uint8_t>(ctx.state[i] >> 8);
        hash[i * 4 + 3] = static_cast<uint8_t>(ctx.state[i]);
    }

    return hash;
}

std::string HashVerifier::toHex(const std::array<uint8_t, 32>& hash) {
    std::ostringstream ss;
    for (auto byte : hash) {
        ss << std::hex << std::setfill('0') << std::setw(2) << static_cast<int>(byte);
    }
    return ss.str();
}

std::string HashVerifier::hashString(const std::string& data) {
    SHA256Context ctx;
    sha256Init(ctx);
    sha256Update(ctx, reinterpret_cast<const uint8_t*>(data.data()), data.size());
    return toHex(sha256Final(ctx));
}

std::string HashVerifier::hashFile(const std::string& filePath) {
    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        return "";
    }

    SHA256Context ctx;
    sha256Init(ctx);

    char buffer[8192];
    while (file.read(buffer, sizeof(buffer)) || file.gcount() > 0) {
        sha256Update(ctx, reinterpret_cast<const uint8_t*>(buffer),
                     static_cast<size_t>(file.gcount()));
        if (file.eof()) break;
    }

    return toHex(sha256Final(ctx));
}

bool HashVerifier::verifyFile(const std::string& filePath, const std::string& expectedHash) {
    std::string actualHash = hashFile(filePath);
    if (actualHash.empty() || actualHash.size() != expectedHash.size()) return false;

    // Constant-time comparison to prevent timing attacks
    volatile unsigned char result = 0;
    for (size_t i = 0; i < actualHash.size(); i++) {
        result |= static_cast<unsigned char>(actualHash[i]) ^
                  static_cast<unsigned char>(expectedHash[i]);
    }
    return result == 0;
}

} // namespace syncv
