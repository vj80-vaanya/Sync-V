#include <gtest/gtest.h>
#include "WiFiServer.h"
#include "EncryptedStorage.h"
#include <filesystem>
#include <fstream>

namespace fs = std::filesystem;

class WiFiServerTest : public ::testing::Test {
protected:
    std::string testDir;

    void SetUp() override {
        testDir = "test_wifi_" + std::to_string(::testing::UnitTest::GetInstance()->random_seed());
        fs::create_directories(testDir);
    }

    void TearDown() override {
        fs::remove_all(testDir);
    }

    void createFile(const std::string& path, const std::string& content) {
        std::ofstream f(path, std::ios::binary);
        f << content;
        f.close();
    }

    // Decode base64 for test verification
    static std::string base64Decode(const std::string& encoded) {
        static const int lookup[] = {
            -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
            -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
            -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,
            52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,
            -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,
            15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,
            -1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
            41,42,43,44,45,46,47,48,49,50,51
        };
        std::string decoded;
        int val = 0, bits = -8;
        for (unsigned char c : encoded) {
            if (c == '=') break;
            if (c >= 128 || lookup[c] == -1) continue;
            val = (val << 6) | lookup[c];
            bits += 6;
            if (bits >= 0) {
                decoded.push_back(static_cast<char>((val >> bits) & 0xFF));
                bits -= 8;
            }
        }
        return decoded;
    }
};

TEST_F(WiFiServerTest, ServesFileList) {
    createFile(testDir + "/log1.txt", "log data 1");
    createFile(testDir + "/log2.txt", "log data 2");

    syncv::WiFiServer server(testDir);
    auto fileList = server.getFileList();

    ASSERT_EQ(fileList.size(), 2);
    bool hasLog1 = false, hasLog2 = false;
    for (const auto& f : fileList) {
        if (f.name == "log1.txt") hasLog1 = true;
        if (f.name == "log2.txt") hasLog2 = true;
        EXPECT_GT(f.size, 0);
    }
    EXPECT_TRUE(hasLog1);
    EXPECT_TRUE(hasLog2);
}

TEST_F(WiFiServerTest, ServesFileContent) {
    std::string content = "detailed log file content here";
    createFile(testDir + "/data.txt", content);

    syncv::WiFiServer server(testDir);
    auto result = server.getFileContent("data.txt");

    EXPECT_TRUE(result.success);
    EXPECT_EQ(result.data, content);
}

TEST_F(WiFiServerTest, ReturnsErrorForMissingFile) {
    syncv::WiFiServer server(testDir);
    auto result = server.getFileContent("missing.txt");

    EXPECT_FALSE(result.success);
    EXPECT_TRUE(result.data.empty());
}

TEST_F(WiFiServerTest, ReceivesFirmwareFile) {
    std::string firmwareData = "FIRMWARE_BINARY_DATA_V2.0";

    syncv::WiFiServer server(testDir);
    bool received = server.receiveFirmware("fw_v2.bin", firmwareData);

    EXPECT_TRUE(received);
    EXPECT_TRUE(fs::exists(testDir + "/firmware/fw_v2.bin"));
}

TEST_F(WiFiServerTest, AuthenticatesWithValidToken) {
    syncv::WiFiServer server(testDir);
    server.setAuthToken("secure-pre-shared-key-1234");

    EXPECT_TRUE(server.authenticate("secure-pre-shared-key-1234"));
}

TEST_F(WiFiServerTest, RejectsInvalidToken) {
    syncv::WiFiServer server(testDir);
    server.setAuthToken("secure-pre-shared-key-1234");

    EXPECT_FALSE(server.authenticate("wrong-token-entirely!"));
    EXPECT_FALSE(server.authenticate(""));
    EXPECT_FALSE(server.authenticate("short"));
}

TEST_F(WiFiServerTest, RejectsWhenNoTokenConfigured) {
    syncv::WiFiServer server(testDir);

    // No auth token set — should reject everything
    EXPECT_FALSE(server.authenticate("any-token-at-all-here"));
}

TEST_F(WiFiServerTest, HandlesConnectionTimeout) {
    syncv::WiFiServer server(testDir);
    server.setTimeoutMs(100);

    EXPECT_EQ(server.getTimeoutMs(), 100);
}

TEST_F(WiFiServerTest, RejectsPathTraversal) {
    createFile(testDir + "/safe.txt", "safe content");

    syncv::WiFiServer server(testDir);
    auto result = server.getFileContent("../../../etc/passwd");

    EXPECT_FALSE(result.success);
}

TEST_F(WiFiServerTest, RejectsHiddenFiles) {
    syncv::WiFiServer server(testDir);
    auto result = server.getFileContent(".hidden");

    EXPECT_FALSE(result.success);
}

TEST_F(WiFiServerTest, RejectsDriveLetterPaths) {
    syncv::WiFiServer server(testDir);
    auto result = server.getFileContent("C:file.txt");

    EXPECT_FALSE(result.success);
}

TEST_F(WiFiServerTest, EmptyDirectoryReturnsEmptyList) {
    syncv::WiFiServer server(testDir);
    auto fileList = server.getFileList();

    EXPECT_TRUE(fileList.empty());
}

// Encryption tests

TEST_F(WiFiServerTest, EncryptionDisabledByDefault) {
    syncv::WiFiServer server(testDir);
    EXPECT_FALSE(server.isEncryptionEnabled());
}

TEST_F(WiFiServerTest, SetEncryptionKeyEnablesEncryption) {
    syncv::WiFiServer server(testDir);
    // 32 bytes = 64 hex chars
    std::string hexKey(64, 'a');
    server.setEncryptionKey(hexKey);
    EXPECT_TRUE(server.isEncryptionEnabled());
}

TEST_F(WiFiServerTest, EncryptedContentDiffersFromRaw) {
    std::string content = "detailed log file content here";
    createFile(testDir + "/data.txt", content);

    syncv::WiFiServer server(testDir);
    std::string hexKey(64, 'a');
    server.setEncryptionKey(hexKey);

    auto result = server.getFileContent("data.txt");
    EXPECT_TRUE(result.success);
    // Encrypted base64 should differ from raw
    EXPECT_NE(result.data, content);
    // Should be valid base64 (only contains base64 chars)
    EXPECT_TRUE(result.data.find_first_not_of("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=") == std::string::npos);
}

TEST_F(WiFiServerTest, EncryptedContentHasValidIV) {
    std::string content = "log data for IV test";
    createFile(testDir + "/ivtest.txt", content);

    syncv::WiFiServer server(testDir);
    std::string hexKey(64, 'b');
    server.setEncryptionKey(hexKey);

    auto result = server.getFileContent("ivtest.txt");
    EXPECT_TRUE(result.success);

    // Base64 decode the result
    std::string decoded = base64Decode(result.data);

    // Should have at least 32 bytes (16 IV + 16 min ciphertext block)
    EXPECT_GE(decoded.size(), 32u);

    // Size should be IV (16) + padded ciphertext (multiple of 16)
    size_t ciphertextLen = decoded.size() - 16;
    EXPECT_EQ(ciphertextLen % 16, 0u);
}

TEST_F(WiFiServerTest, EncryptedContentIsDecryptable) {
    std::string content = "sensor data to encrypt and decrypt";
    createFile(testDir + "/roundtrip.txt", content);

    std::string hexKey(64, 'c');

    syncv::WiFiServer server(testDir);
    server.setEncryptionKey(hexKey);

    auto result = server.getFileContent("roundtrip.txt");
    EXPECT_TRUE(result.success);

    // Base64 decode
    std::string ciphertext = base64Decode(result.data);

    // Create a decryptor with the same key
    std::string rawKey;
    for (size_t i = 0; i + 1 < hexKey.size(); i += 2) {
        unsigned int byte;
        std::sscanf(hexKey.c_str() + i, "%02x", &byte);
        rawKey.push_back(static_cast<char>(byte));
    }
    syncv::EncryptedStorage decryptor(rawKey);
    std::string plaintext = decryptor.decrypt(ciphertext);

    EXPECT_EQ(plaintext, content);
}

TEST_F(WiFiServerTest, WithoutKeyReturnsRawData) {
    std::string content = "raw content without encryption";
    createFile(testDir + "/raw.txt", content);

    syncv::WiFiServer server(testDir);
    // No setEncryptionKey called

    auto result = server.getFileContent("raw.txt");
    EXPECT_TRUE(result.success);
    EXPECT_EQ(result.data, content);
}
