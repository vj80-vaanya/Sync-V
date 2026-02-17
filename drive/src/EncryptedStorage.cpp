#include "EncryptedStorage.h"
#include <fstream>
#include <random>
#include <cstring>
#include <algorithm>

namespace syncv {

// AES S-Box
static const uint8_t SBOX[256] = {
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
};

// Inverse S-Box
static const uint8_t INV_SBOX[256] = {
    0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
    0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
    0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
    0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
    0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
    0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
    0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
    0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
    0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
    0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
    0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
    0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
    0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
    0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
    0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
    0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d
};

static const uint8_t RCON[11] = {
    0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36
};

static uint8_t gmul(uint8_t a, uint8_t b) {
    uint8_t p = 0;
    for (int i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        bool hi = a & 0x80;
        a <<= 1;
        if (hi) a ^= 0x1b;
        b >>= 1;
    }
    return p;
}

EncryptedStorage::EncryptedStorage(const std::string& key) {
    key_.resize(KEY_SIZE);
    size_t copyLen = std::min(key.size(), static_cast<size_t>(KEY_SIZE));
    std::memcpy(key_.data(), key.data(), copyLen);
    if (copyLen < KEY_SIZE) {
        std::memset(key_.data() + copyLen, 0, KEY_SIZE - copyLen);
    }
}

std::vector<uint8_t> EncryptedStorage::generateIV() {
    std::vector<uint8_t> iv(IV_SIZE);
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<int> dist(0, 255);
    for (int i = 0; i < IV_SIZE; i++) {
        iv[i] = static_cast<uint8_t>(dist(gen));
    }
    return iv;
}

std::vector<uint8_t> EncryptedStorage::pkcs7Pad(const std::vector<uint8_t>& data) {
    size_t padLen = BLOCK_SIZE - (data.size() % BLOCK_SIZE);
    std::vector<uint8_t> padded = data;
    padded.insert(padded.end(), padLen, static_cast<uint8_t>(padLen));
    return padded;
}

std::vector<uint8_t> EncryptedStorage::pkcs7Unpad(const std::vector<uint8_t>& data) {
    if (data.empty()) return data;
    uint8_t padLen = data.back();
    if (padLen == 0 || padLen > BLOCK_SIZE || padLen > data.size()) return {};
    for (size_t i = data.size() - padLen; i < data.size(); i++) {
        if (data[i] != padLen) return {};
    }
    return std::vector<uint8_t>(data.begin(), data.end() - padLen);
}

void EncryptedStorage::aesKeyExpansion(const uint8_t* key, uint32_t* roundKeys) {
    for (int i = 0; i < 8; i++) {
        roundKeys[i] = (static_cast<uint32_t>(key[4*i]) << 24) |
                       (static_cast<uint32_t>(key[4*i+1]) << 16) |
                       (static_cast<uint32_t>(key[4*i+2]) << 8) |
                       static_cast<uint32_t>(key[4*i+3]);
    }

    for (int i = 8; i < 60; i++) {
        uint32_t temp = roundKeys[i - 1];
        if (i % 8 == 0) {
            temp = ((SBOX[(temp >> 16) & 0xFF] << 24) |
                    (SBOX[(temp >> 8) & 0xFF] << 16) |
                    (SBOX[temp & 0xFF] << 8) |
                    SBOX[(temp >> 24) & 0xFF]);
            temp ^= static_cast<uint32_t>(RCON[i / 8]) << 24;
        } else if (i % 8 == 4) {
            temp = (static_cast<uint32_t>(SBOX[(temp >> 24) & 0xFF]) << 24) |
                   (static_cast<uint32_t>(SBOX[(temp >> 16) & 0xFF]) << 16) |
                   (static_cast<uint32_t>(SBOX[(temp >> 8) & 0xFF]) << 8) |
                   static_cast<uint32_t>(SBOX[temp & 0xFF]);
        }
        roundKeys[i] = roundKeys[i - 8] ^ temp;
    }
}

void EncryptedStorage::subBytes(uint8_t state[16]) {
    for (int i = 0; i < 16; i++) state[i] = SBOX[state[i]];
}

void EncryptedStorage::invSubBytes(uint8_t state[16]) {
    for (int i = 0; i < 16; i++) state[i] = INV_SBOX[state[i]];
}

void EncryptedStorage::shiftRows(uint8_t state[16]) {
    uint8_t t;
    // Row 1: shift left 1
    t = state[1]; state[1] = state[5]; state[5] = state[9]; state[9] = state[13]; state[13] = t;
    // Row 2: shift left 2
    t = state[2]; state[2] = state[10]; state[10] = t;
    t = state[6]; state[6] = state[14]; state[14] = t;
    // Row 3: shift left 3
    t = state[15]; state[15] = state[11]; state[11] = state[7]; state[7] = state[3]; state[3] = t;
}

void EncryptedStorage::invShiftRows(uint8_t state[16]) {
    uint8_t t;
    // Row 1: shift right 1
    t = state[13]; state[13] = state[9]; state[9] = state[5]; state[5] = state[1]; state[1] = t;
    // Row 2: shift right 2
    t = state[2]; state[2] = state[10]; state[10] = t;
    t = state[6]; state[6] = state[14]; state[14] = t;
    // Row 3: shift right 3
    t = state[3]; state[3] = state[7]; state[7] = state[11]; state[11] = state[15]; state[15] = t;
}

void EncryptedStorage::mixColumns(uint8_t state[16]) {
    for (int c = 0; c < 4; c++) {
        int i = c * 4;
        uint8_t a0 = state[i], a1 = state[i+1], a2 = state[i+2], a3 = state[i+3];
        state[i]   = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
        state[i+1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
        state[i+2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
        state[i+3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
    }
}

void EncryptedStorage::invMixColumns(uint8_t state[16]) {
    for (int c = 0; c < 4; c++) {
        int i = c * 4;
        uint8_t a0 = state[i], a1 = state[i+1], a2 = state[i+2], a3 = state[i+3];
        state[i]   = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
        state[i+1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
        state[i+2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
        state[i+3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
    }
}

void EncryptedStorage::addRoundKey(uint8_t state[16], const uint32_t* roundKey) {
    for (int c = 0; c < 4; c++) {
        state[c*4]   ^= static_cast<uint8_t>(roundKey[c] >> 24);
        state[c*4+1] ^= static_cast<uint8_t>(roundKey[c] >> 16);
        state[c*4+2] ^= static_cast<uint8_t>(roundKey[c] >> 8);
        state[c*4+3] ^= static_cast<uint8_t>(roundKey[c]);
    }
}

void EncryptedStorage::aesEncryptBlock(const uint8_t* input, uint8_t* output,
                                        const uint32_t* roundKeys) {
    uint8_t state[16];
    std::memcpy(state, input, 16);

    addRoundKey(state, roundKeys);

    for (int round = 1; round < NUM_ROUNDS; round++) {
        subBytes(state);
        shiftRows(state);
        mixColumns(state);
        addRoundKey(state, roundKeys + round * 4);
    }

    subBytes(state);
    shiftRows(state);
    addRoundKey(state, roundKeys + NUM_ROUNDS * 4);

    std::memcpy(output, state, 16);
}

void EncryptedStorage::aesDecryptBlock(const uint8_t* input, uint8_t* output,
                                        const uint32_t* roundKeys) {
    uint8_t state[16];
    std::memcpy(state, input, 16);

    addRoundKey(state, roundKeys + NUM_ROUNDS * 4);

    for (int round = NUM_ROUNDS - 1; round >= 1; round--) {
        invShiftRows(state);
        invSubBytes(state);
        addRoundKey(state, roundKeys + round * 4);
        invMixColumns(state);
    }

    invShiftRows(state);
    invSubBytes(state);
    addRoundKey(state, roundKeys);

    std::memcpy(output, state, 16);
}

std::string EncryptedStorage::encrypt(const std::string& plaintext) {
    auto iv = generateIV();

    std::vector<uint8_t> data(plaintext.begin(), plaintext.end());
    auto padded = pkcs7Pad(data);

    uint32_t roundKeys[60];
    aesKeyExpansion(key_.data(), roundKeys);

    std::vector<uint8_t> ciphertext;
    ciphertext.insert(ciphertext.end(), iv.begin(), iv.end());

    uint8_t prevBlock[16];
    std::memcpy(prevBlock, iv.data(), 16);

    for (size_t i = 0; i < padded.size(); i += BLOCK_SIZE) {
        uint8_t block[16];
        for (int j = 0; j < 16; j++) {
            block[j] = padded[i + j] ^ prevBlock[j];
        }

        uint8_t encrypted[16];
        aesEncryptBlock(block, encrypted, roundKeys);

        ciphertext.insert(ciphertext.end(), encrypted, encrypted + 16);
        std::memcpy(prevBlock, encrypted, 16);
    }

    return std::string(ciphertext.begin(), ciphertext.end());
}

std::string EncryptedStorage::decrypt(const std::string& ciphertext) {
    if (ciphertext.size() < IV_SIZE + BLOCK_SIZE) {
        return "";
    }

    std::vector<uint8_t> data(ciphertext.begin(), ciphertext.end());

    uint8_t iv[16];
    std::memcpy(iv, data.data(), 16);

    uint32_t roundKeys[60];
    aesKeyExpansion(key_.data(), roundKeys);

    std::vector<uint8_t> decrypted;
    uint8_t prevBlock[16];
    std::memcpy(prevBlock, iv, 16);

    for (size_t i = IV_SIZE; i < data.size(); i += BLOCK_SIZE) {
        uint8_t block[16];
        std::memcpy(block, data.data() + i, 16);

        uint8_t plainBlock[16];
        aesDecryptBlock(block, plainBlock, roundKeys);

        for (int j = 0; j < 16; j++) {
            plainBlock[j] ^= prevBlock[j];
        }

        decrypted.insert(decrypted.end(), plainBlock, plainBlock + 16);
        std::memcpy(prevBlock, block, 16);
    }

    auto unpadded = pkcs7Unpad(decrypted);
    return std::string(unpadded.begin(), unpadded.end());
}

bool EncryptedStorage::storeToFile(const std::string& filePath, const std::string& plaintext) {
    std::string encrypted = encrypt(plaintext);
    std::ofstream file(filePath, std::ios::binary);
    if (!file.is_open()) return false;
    file.write(encrypted.data(), static_cast<std::streamsize>(encrypted.size()));
    return file.good();
}

std::string EncryptedStorage::loadFromFile(const std::string& filePath) {
    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) return "";
    std::string ciphertext((std::istreambuf_iterator<char>(file)),
                            std::istreambuf_iterator<char>());
    return decrypt(ciphertext);
}

} // namespace syncv
