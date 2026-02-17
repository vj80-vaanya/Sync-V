#include <gtest/gtest.h>
#include "FirmwareReceiver.h"
#include "HashVerifier.h"
#include <fstream>
#include <filesystem>

namespace fs = std::filesystem;

class FirmwareReceiverTest : public ::testing::Test {
protected:
    std::string testDir;

    void SetUp() override {
        testDir = "test_firmware_" + std::to_string(::testing::UnitTest::GetInstance()->random_seed());
        fs::create_directories(testDir);
        fs::create_directories(testDir + "/staging");
        fs::create_directories(testDir + "/installed");
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

TEST_F(FirmwareReceiverTest, ReceivesFirmwarePackage) {
    std::string firmwareData = "FIRMWARE_PACKAGE_BINARY_CONTENT_V1";

    syncv::FirmwareReceiver receiver(testDir + "/staging", testDir + "/installed");
    bool received = receiver.receive("device_fw_v1.0.bin", firmwareData);

    EXPECT_TRUE(received);
    EXPECT_TRUE(fs::exists(testDir + "/staging/device_fw_v1.0.bin"));
}

TEST_F(FirmwareReceiverTest, VerifiesHashOfFirmware) {
    std::string firmwareData = "FIRMWARE_DATA_FOR_HASH_TEST";

    syncv::HashVerifier verifier;
    std::string expectedHash = verifier.hashString(firmwareData);

    syncv::FirmwareReceiver receiver(testDir + "/staging", testDir + "/installed");
    receiver.receive("fw.bin", firmwareData);

    bool valid = receiver.verifyIntegrity("fw.bin", expectedHash);
    EXPECT_TRUE(valid);
}

TEST_F(FirmwareReceiverTest, RejectsTamperedFirmware) {
    std::string firmwareData = "ORIGINAL_FIRMWARE";

    syncv::FirmwareReceiver receiver(testDir + "/staging", testDir + "/installed");
    receiver.receive("fw.bin", firmwareData);

    bool valid = receiver.verifyIntegrity("fw.bin",
        "0000000000000000000000000000000000000000000000000000000000000000");
    EXPECT_FALSE(valid);
}

TEST_F(FirmwareReceiverTest, AppliesFirmwareAfterVerification) {
    std::string firmwareData = "VERIFIED_FIRMWARE_PAYLOAD";

    syncv::HashVerifier verifier;
    std::string hash = verifier.hashString(firmwareData);

    syncv::FirmwareReceiver receiver(testDir + "/staging", testDir + "/installed");
    receiver.receive("fw.bin", firmwareData);

    ASSERT_TRUE(receiver.verifyIntegrity("fw.bin", hash));

    bool applied = receiver.apply("fw.bin");
    EXPECT_TRUE(applied);
    EXPECT_TRUE(fs::exists(testDir + "/installed/fw.bin"));
}

TEST_F(FirmwareReceiverTest, RefusesApplyWithoutVerification) {
    std::string firmwareData = "UNVERIFIED_FIRMWARE";

    syncv::FirmwareReceiver receiver(testDir + "/staging", testDir + "/installed");
    receiver.receive("fw.bin", firmwareData);

    // Apply without verify should fail
    bool applied = receiver.apply("fw.bin");
    EXPECT_FALSE(applied);
}

TEST_F(FirmwareReceiverTest, ReportsReceiveStatus) {
    syncv::FirmwareReceiver receiver(testDir + "/staging", testDir + "/installed");

    auto status = receiver.getStatus("fw.bin");
    EXPECT_EQ(status, syncv::FirmwareStatus::NotFound);

    receiver.receive("fw.bin", "DATA");
    status = receiver.getStatus("fw.bin");
    EXPECT_EQ(status, syncv::FirmwareStatus::Received);

    syncv::HashVerifier v;
    receiver.verifyIntegrity("fw.bin", v.hashString("DATA"));
    status = receiver.getStatus("fw.bin");
    EXPECT_EQ(status, syncv::FirmwareStatus::Verified);
}

TEST_F(FirmwareReceiverTest, HandlesEmptyFirmware) {
    syncv::FirmwareReceiver receiver(testDir + "/staging", testDir + "/installed");
    bool received = receiver.receive("empty.bin", "");

    EXPECT_FALSE(received);
}
