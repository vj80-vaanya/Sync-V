#include <gtest/gtest.h>
#include "LogCollector.h"
#include <fstream>
#include <filesystem>

namespace fs = std::filesystem;

class LogCollectorTest : public ::testing::Test {
protected:
    std::string testDir;

    void SetUp() override {
        testDir = "test_logs_" + std::to_string(::testing::UnitTest::GetInstance()->random_seed());
        fs::create_directories(testDir + "/deviceA");
        fs::create_directories(testDir + "/deviceB");
    }

    void TearDown() override {
        fs::remove_all(testDir);
    }

    void createFile(const std::string& path, const std::string& content) {
        std::ofstream f(path);
        f << content;
        f.close();
    }
};

TEST_F(LogCollectorTest, ReadsLogFilesFromDirectory) {
    createFile(testDir + "/deviceA/log1.txt", "timestamp=1001 event=start\n");
    createFile(testDir + "/deviceA/log2.txt", "timestamp=1002 event=stop\n");

    syncv::LogCollector collector;
    auto logs = collector.collectFromDirectory(testDir + "/deviceA");

    ASSERT_EQ(logs.size(), 2);
    EXPECT_FALSE(logs[0].content.empty());
    EXPECT_FALSE(logs[1].content.empty());
}

TEST_F(LogCollectorTest, ReadsMultipleFormats) {
    createFile(testDir + "/deviceA/data.csv", "ts,event\n1001,start\n");
    createFile(testDir + "/deviceA/data.json", "{\"ts\":1001,\"event\":\"start\"}");
    createFile(testDir + "/deviceA/data.bin", "\x01\x02\x03\x04");

    syncv::LogCollector collector;
    auto logs = collector.collectFromDirectory(testDir + "/deviceA");

    ASSERT_EQ(logs.size(), 3);
    for (const auto& log : logs) {
        EXPECT_FALSE(log.filename.empty());
        EXPECT_FALSE(log.content.empty());
    }
}

TEST_F(LogCollectorTest, HandlesEmptyDirectory) {
    syncv::LogCollector collector;
    auto logs = collector.collectFromDirectory(testDir + "/deviceB");

    EXPECT_TRUE(logs.empty());
}

TEST_F(LogCollectorTest, HandlesMissingDirectory) {
    syncv::LogCollector collector;
    auto logs = collector.collectFromDirectory(testDir + "/nonexistent");

    EXPECT_TRUE(logs.empty());
}

TEST_F(LogCollectorTest, HandlesCorruptedLogFiles) {
    createFile(testDir + "/deviceA/corrupt.txt", "");

    syncv::LogCollector collector;
    auto logs = collector.collectFromDirectory(testDir + "/deviceA");

    // Empty files should still be collected but flagged
    ASSERT_EQ(logs.size(), 1);
    EXPECT_TRUE(logs[0].content.empty());
    EXPECT_EQ(logs[0].filename, "corrupt.txt");
}

TEST_F(LogCollectorTest, CollectsFromMultipleDeviceTypes) {
    createFile(testDir + "/deviceA/logA.txt", "device A log data");
    createFile(testDir + "/deviceB/logB.txt", "device B log data");

    syncv::LogCollector collector;
    auto logsA = collector.collectFromDirectory(testDir + "/deviceA");
    auto logsB = collector.collectFromDirectory(testDir + "/deviceB");

    ASSERT_EQ(logsA.size(), 1);
    ASSERT_EQ(logsB.size(), 1);
    EXPECT_NE(logsA[0].content, logsB[0].content);
}

TEST_F(LogCollectorTest, EnumeratesFilesWithMetadata) {
    createFile(testDir + "/deviceA/log.txt", "some log data here");

    syncv::LogCollector collector;
    auto logs = collector.collectFromDirectory(testDir + "/deviceA");

    ASSERT_EQ(logs.size(), 1);
    EXPECT_EQ(logs[0].filename, "log.txt");
    EXPECT_GT(logs[0].fileSize, 0);
}

TEST_F(LogCollectorTest, SkipsSubdirectories) {
    fs::create_directories(testDir + "/deviceA/subdir");
    createFile(testDir + "/deviceA/log.txt", "top level log");
    createFile(testDir + "/deviceA/subdir/nested.txt", "nested log");

    syncv::LogCollector collector;
    auto logs = collector.collectFromDirectory(testDir + "/deviceA", false);

    ASSERT_EQ(logs.size(), 1);
    EXPECT_EQ(logs[0].filename, "log.txt");
}

TEST_F(LogCollectorTest, RecursiveCollectionIncludesSubdirs) {
    fs::create_directories(testDir + "/deviceA/subdir");
    createFile(testDir + "/deviceA/log.txt", "top level log");
    createFile(testDir + "/deviceA/subdir/nested.txt", "nested log");

    syncv::LogCollector collector;
    auto logs = collector.collectFromDirectory(testDir + "/deviceA", true);

    ASSERT_EQ(logs.size(), 2);
}
