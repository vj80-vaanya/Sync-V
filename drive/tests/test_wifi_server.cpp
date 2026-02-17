#include <gtest/gtest.h>
#include "WiFiServer.h"
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
