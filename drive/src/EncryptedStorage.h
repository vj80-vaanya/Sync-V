#pragma once

#include <string>
#include <vector>
#include <cstdint>

namespace syncv {

class EncryptedStorage {
public:
    /// @param key 32-byte key string for AES-256 encryption.
    explicit EncryptedStorage(const std::string& key);

    /// Encrypt plaintext data. Returns ciphertext with prepended random IV.
    std::string encrypt(const std::string& plaintext);

    /// Decrypt ciphertext (expects prepended IV). Returns plaintext.
    std::string decrypt(const std::string& ciphertext);

    /// Encrypt data and store to file. Returns true on success.
    bool storeToFile(const std::string& filePath, const std::string& plaintext);

    /// Load and decrypt data from file. Returns empty string on failure.
    std::string loadFromFile(const std::string& filePath);

private:
    std::vector<uint8_t> key_;

    // AES-256-CBC implementation
    static const int BLOCK_SIZE = 16;
    static const int KEY_SIZE = 32;
    static const int IV_SIZE = 16;
    static const int NUM_ROUNDS = 14;

    void aesKeyExpansion(const uint8_t* key, uint32_t* roundKeys);
    void aesEncryptBlock(const uint8_t* input, uint8_t* output, const uint32_t* roundKeys);
    void aesDecryptBlock(const uint8_t* input, uint8_t* output, const uint32_t* roundKeys);

    // AES internals
    void subBytes(uint8_t state[16]);
    void invSubBytes(uint8_t state[16]);
    void shiftRows(uint8_t state[16]);
    void invShiftRows(uint8_t state[16]);
    void mixColumns(uint8_t state[16]);
    void invMixColumns(uint8_t state[16]);
    void addRoundKey(uint8_t state[16], const uint32_t* roundKey);

    std::vector<uint8_t> generateIV();
    std::vector<uint8_t> pkcs7Pad(const std::vector<uint8_t>& data);
    std::vector<uint8_t> pkcs7Unpad(const std::vector<uint8_t>& data);
};

} // namespace syncv
