#include <gtest/gtest.h>
#include "EncryptedStorage.h"
#include <fstream>
#include <filesystem>

namespace fs = std::filesystem;

class EncryptedStorageTest : public ::testing::Test {
protected:
    std::string testDir;
    std::string testKey;

    void SetUp() override {
        testDir = "test_encrypted_" + std::to_string(::testing::UnitTest::GetInstance()->random_seed());
        fs::create_directories(testDir);
        // 32-byte key for AES-256 (hex-encoded for readability)
        testKey = "0123456789abcdef0123456789abcdef";
    }

    void TearDown() override {
        fs::remove_all(testDir);
    }

    void createFile(const std::string& path, const std::string& content) {
        std::ofstream f(path, std::ios::binary);
        f << content;
        f.close();
    }

    std::string readFileContent(const std::string& path) {
        std::ifstream f(path, std::ios::binary);
        return std::string((std::istreambuf_iterator<char>(f)),
                           std::istreambuf_iterator<char>());
    }
};

TEST_F(EncryptedStorageTest, EncryptThenDecryptReturnsOriginal) {
    std::string original = "This is sensitive log data from a device.";

    syncv::EncryptedStorage storage(testKey);
    auto encrypted = storage.encrypt(original);
    auto decrypted = storage.decrypt(encrypted);

    EXPECT_EQ(decrypted, original);
    EXPECT_NE(encrypted, original); // Must actually encrypt
}

TEST_F(EncryptedStorageTest, EncryptSmallData) {
    std::string original = "A";

    syncv::EncryptedStorage storage(testKey);
    auto encrypted = storage.encrypt(original);
    auto decrypted = storage.decrypt(encrypted);

    EXPECT_EQ(decrypted, original);
}

TEST_F(EncryptedStorageTest, EncryptLargeData) {
    std::string original(100000, 'X'); // 100KB

    syncv::EncryptedStorage storage(testKey);
    auto encrypted = storage.encrypt(original);
    auto decrypted = storage.decrypt(encrypted);

    EXPECT_EQ(decrypted, original);
}

TEST_F(EncryptedStorageTest, EncryptEmptyData) {
    std::string original = "";

    syncv::EncryptedStorage storage(testKey);
    auto encrypted = storage.encrypt(original);
    auto decrypted = storage.decrypt(encrypted);

    EXPECT_EQ(decrypted, original);
}

TEST_F(EncryptedStorageTest, WrongKeyFailsDecryption) {
    std::string original = "Secret data that must be protected.";
    std::string wrongKey = "fedcba9876543210fedcba9876543210";

    syncv::EncryptedStorage storage(testKey);
    auto encrypted = storage.encrypt(original);

    syncv::EncryptedStorage wrongStorage(wrongKey);
    auto decrypted = wrongStorage.decrypt(encrypted);

    EXPECT_NE(decrypted, original);
}

TEST_F(EncryptedStorageTest, StoreAndRetrieveFromDisk) {
    std::string original = "Persistent encrypted data on disk.";
    std::string filePath = testDir + "/encrypted.dat";

    syncv::EncryptedStorage storage(testKey);
    bool stored = storage.storeToFile(filePath, original);
    ASSERT_TRUE(stored);

    // File content should not be plaintext
    std::string rawContent = readFileContent(filePath);
    EXPECT_NE(rawContent, original);

    // Should decrypt correctly
    auto retrieved = storage.loadFromFile(filePath);
    EXPECT_EQ(retrieved, original);
}

TEST_F(EncryptedStorageTest, LoadFromMissingFileReturnsEmpty) {
    syncv::EncryptedStorage storage(testKey);
    auto result = storage.loadFromFile(testDir + "/missing.dat");
    EXPECT_TRUE(result.empty());
}

TEST_F(EncryptedStorageTest, DifferentEncryptionsProduceDifferentCiphertext) {
    std::string original = "Same plaintext encrypted twice.";

    syncv::EncryptedStorage storage(testKey);
    auto encrypted1 = storage.encrypt(original);
    auto encrypted2 = storage.encrypt(original);

    // With random IV, two encryptions of same data should differ
    EXPECT_NE(encrypted1, encrypted2);

    // But both should decrypt to same plaintext
    EXPECT_EQ(storage.decrypt(encrypted1), original);
    EXPECT_EQ(storage.decrypt(encrypted2), original);
}
