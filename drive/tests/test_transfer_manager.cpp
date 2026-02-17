#include <gtest/gtest.h>
#include "TransferManager.h"
#include <filesystem>
#include <fstream>
#include <thread>
#include <chrono>

namespace fs = std::filesystem;

class TransferManagerTest : public ::testing::Test {
protected:
    std::string testDir;

    void SetUp() override {
        testDir = "test_transfer_" + std::to_string(::testing::UnitTest::GetInstance()->random_seed());
        fs::create_directories(testDir + "/source");
        fs::create_directories(testDir + "/dest");
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

TEST_F(TransferManagerTest, TransfersFileSuccessfully) {
    std::string content = "file content to transfer";
    createFile(testDir + "/source/data.bin", content);

    syncv::TransferManager manager;
    auto result = manager.transfer(testDir + "/source/data.bin", testDir + "/dest/data.bin");

    EXPECT_TRUE(result.success);
    EXPECT_EQ(readFileContent(testDir + "/dest/data.bin"), content);
}

TEST_F(TransferManagerTest, ResumesInterruptedTransfer) {
    // Create a 10KB source file
    std::string content(10240, 'Z');
    createFile(testDir + "/source/big.bin", content);

    // Simulate a partial transfer (write first half)
    std::string partial = content.substr(0, 5120);
    createFile(testDir + "/dest/big.bin", partial);

    syncv::TransferManager manager;
    // Record partial state
    manager.recordPartialTransfer(testDir + "/source/big.bin",
                                  testDir + "/dest/big.bin", 5120);

    auto result = manager.resumeTransfer(testDir + "/source/big.bin",
                                         testDir + "/dest/big.bin");

    EXPECT_TRUE(result.success);
    EXPECT_EQ(readFileContent(testDir + "/dest/big.bin"), content);
}

TEST_F(TransferManagerTest, RetriesWithBackoff) {
    syncv::TransferManager manager;
    manager.setMaxRetries(3);
    manager.setBaseBackoffMs(10); // Short for testing

    int attemptCount = 0;
    auto failingTransfer = [&]() -> bool {
        attemptCount++;
        return attemptCount >= 3; // Succeed on 3rd attempt
    };

    bool result = manager.retryWithBackoff(failingTransfer);

    EXPECT_TRUE(result);
    EXPECT_EQ(attemptCount, 3);
}

TEST_F(TransferManagerTest, RetriesExhausted) {
    syncv::TransferManager manager;
    manager.setMaxRetries(2);
    manager.setBaseBackoffMs(10);

    auto alwaysFails = []() -> bool { return false; };

    bool result = manager.retryWithBackoff(alwaysFails);

    EXPECT_FALSE(result);
}

TEST_F(TransferManagerTest, TracksTransferProgress) {
    std::string content(10240, 'X');
    createFile(testDir + "/source/file.bin", content);

    syncv::TransferManager manager;
    manager.setChunkSize(2048);

    std::vector<float> progressUpdates;
    manager.onProgress([&](float pct) {
        progressUpdates.push_back(pct);
    });

    manager.transfer(testDir + "/source/file.bin", testDir + "/dest/file.bin");

    EXPECT_FALSE(progressUpdates.empty());
    EXPECT_FLOAT_EQ(progressUpdates.back(), 100.0f);

    // Progress should be monotonically increasing
    for (size_t i = 1; i < progressUpdates.size(); i++) {
        EXPECT_GE(progressUpdates[i], progressUpdates[i - 1]);
    }
}

TEST_F(TransferManagerTest, HandlesMissingSourceFile) {
    syncv::TransferManager manager;
    auto result = manager.transfer(testDir + "/source/missing.bin",
                                   testDir + "/dest/output.bin");

    EXPECT_FALSE(result.success);
    EXPECT_FALSE(result.errorMessage.empty());
}

TEST_F(TransferManagerTest, TransfersMultipleFilesSequentially) {
    createFile(testDir + "/source/a.bin", "file A");
    createFile(testDir + "/source/b.bin", "file B");
    createFile(testDir + "/source/c.bin", "file C");

    syncv::TransferManager manager;
    std::vector<std::pair<std::string, std::string>> files = {
        {testDir + "/source/a.bin", testDir + "/dest/a.bin"},
        {testDir + "/source/b.bin", testDir + "/dest/b.bin"},
        {testDir + "/source/c.bin", testDir + "/dest/c.bin"},
    };

    auto results = manager.transferBatch(files);

    ASSERT_EQ(results.size(), 3);
    for (const auto& r : results) {
        EXPECT_TRUE(r.success);
    }
}

TEST_F(TransferManagerTest, CalculatesTransferSpeed) {
    std::string content(102400, 'D'); // 100KB
    createFile(testDir + "/source/speed.bin", content);

    syncv::TransferManager manager;
    auto result = manager.transfer(testDir + "/source/speed.bin",
                                   testDir + "/dest/speed.bin");

    EXPECT_TRUE(result.success);
    EXPECT_GT(result.bytesPerSecond, 0.0);
    EXPECT_EQ(result.bytesTransferred, 102400);
}
