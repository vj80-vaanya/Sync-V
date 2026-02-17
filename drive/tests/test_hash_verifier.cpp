#include <gtest/gtest.h>
#include "HashVerifier.h"
#include <fstream>
#include <filesystem>

namespace fs = std::filesystem;

class HashVerifierTest : public ::testing::Test {
protected:
    std::string testDir;

    void SetUp() override {
        testDir = "test_hash_" + std::to_string(::testing::UnitTest::GetInstance()->random_seed());
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
};

TEST_F(HashVerifierTest, HashOfKnownStringMatchesExpected) {
    // SHA256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    syncv::HashVerifier verifier;
    std::string hash = verifier.hashString("hello");
    EXPECT_EQ(hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
}

TEST_F(HashVerifierTest, HashOfFileMatchesExpected) {
    createFile(testDir + "/test.txt", "hello");

    syncv::HashVerifier verifier;
    std::string hash = verifier.hashFile(testDir + "/test.txt");
    EXPECT_EQ(hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
}

TEST_F(HashVerifierTest, DetectsHashMismatch) {
    createFile(testDir + "/test.txt", "hello");

    syncv::HashVerifier verifier;
    bool match = verifier.verifyFile(testDir + "/test.txt",
        "0000000000000000000000000000000000000000000000000000000000000000");
    EXPECT_FALSE(match);
}

TEST_F(HashVerifierTest, VerifiesCorrectHash) {
    createFile(testDir + "/test.txt", "hello");

    syncv::HashVerifier verifier;
    bool match = verifier.verifyFile(testDir + "/test.txt",
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    EXPECT_TRUE(match);
}

TEST_F(HashVerifierTest, HashesLargeFileStreaming) {
    // Create a ~1MB file
    std::string chunk(1024, 'A');
    std::ofstream f(testDir + "/large.bin", std::ios::binary);
    for (int i = 0; i < 1024; i++) {
        f << chunk;
    }
    f.close();

    syncv::HashVerifier verifier;
    std::string hash = verifier.hashFile(testDir + "/large.bin");

    EXPECT_EQ(hash.size(), 64); // SHA256 hex is 64 chars
    EXPECT_FALSE(hash.empty());

    // Hashing same file twice should give same result
    std::string hash2 = verifier.hashFile(testDir + "/large.bin");
    EXPECT_EQ(hash, hash2);
}

TEST_F(HashVerifierTest, HashOfEmptyFile) {
    createFile(testDir + "/empty.bin", "");

    syncv::HashVerifier verifier;
    std::string hash = verifier.hashFile(testDir + "/empty.bin");

    // SHA256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    EXPECT_EQ(hash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
}

TEST_F(HashVerifierTest, HashOfMissingFileReturnsEmpty) {
    syncv::HashVerifier verifier;
    std::string hash = verifier.hashFile(testDir + "/nonexistent.bin");
    EXPECT_TRUE(hash.empty());
}

TEST_F(HashVerifierTest, HashOfEmptyStringMatchesExpected) {
    syncv::HashVerifier verifier;
    std::string hash = verifier.hashString("");
    EXPECT_EQ(hash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
}
