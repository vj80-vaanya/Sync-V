#include <gtest/gtest.h>
#include "MetadataExtractor.h"

class MetadataExtractorTest : public ::testing::Test {
protected:
    syncv::MetadataExtractor extractor;
};

TEST_F(MetadataExtractorTest, ParsesDeviceTypeAFormat) {
    // Type A: key=value format
    std::string raw = "device_id=DEV001\nfirmware_version=1.2.3\nuptime_hours=1024\nstatus=running\n";

    auto metadata = extractor.extract(raw, "typeA");

    EXPECT_EQ(metadata.deviceId, "DEV001");
    EXPECT_EQ(metadata.firmwareVersion, "1.2.3");
    EXPECT_EQ(metadata.fields["uptime_hours"], "1024");
    EXPECT_EQ(metadata.fields["status"], "running");
    EXPECT_EQ(metadata.deviceType, "typeA");
}

TEST_F(MetadataExtractorTest, ParsesDeviceTypeBFormat) {
    // Type B: JSON format
    std::string raw = R"({"id":"DEV002","fw":"2.0.0","temp":45.5,"mode":"active"})";

    auto metadata = extractor.extract(raw, "typeB");

    EXPECT_EQ(metadata.deviceId, "DEV002");
    EXPECT_EQ(metadata.firmwareVersion, "2.0.0");
    EXPECT_EQ(metadata.fields["temp"], "45.5");
    EXPECT_EQ(metadata.fields["mode"], "active");
    EXPECT_EQ(metadata.deviceType, "typeB");
}

TEST_F(MetadataExtractorTest, HandlesUnknownDeviceType) {
    std::string raw = "some random data format";

    auto metadata = extractor.extract(raw, "unknownType");

    EXPECT_TRUE(metadata.deviceId.empty());
    EXPECT_EQ(metadata.deviceType, "unknownType");
    EXPECT_FALSE(metadata.parseSuccessful);
}

TEST_F(MetadataExtractorTest, HandlesMalformedTypeAData) {
    std::string raw = "this is not key=value properly\n===broken===\n";

    auto metadata = extractor.extract(raw, "typeA");

    EXPECT_FALSE(metadata.parseSuccessful);
    EXPECT_EQ(metadata.deviceType, "typeA");
}

TEST_F(MetadataExtractorTest, HandlesMalformedTypeBData) {
    std::string raw = "{broken json content";

    auto metadata = extractor.extract(raw, "typeB");

    EXPECT_FALSE(metadata.parseSuccessful);
    EXPECT_EQ(metadata.deviceType, "typeB");
}

TEST_F(MetadataExtractorTest, HandlesEmptyInput) {
    auto metadata = extractor.extract("", "typeA");

    EXPECT_FALSE(metadata.parseSuccessful);
    EXPECT_TRUE(metadata.deviceId.empty());
}

TEST_F(MetadataExtractorTest, RegistersCustomParser) {
    // Register a custom parser for a new device type
    extractor.registerParser("typeC", [](const std::string& raw) -> syncv::DeviceMetadata {
        syncv::DeviceMetadata m;
        m.deviceType = "typeC";
        m.parseSuccessful = true;
        // Simple CSV: id,fw_version,field1
        auto comma1 = raw.find(',');
        auto comma2 = raw.find(',', comma1 + 1);
        if (comma1 != std::string::npos && comma2 != std::string::npos) {
            m.deviceId = raw.substr(0, comma1);
            m.firmwareVersion = raw.substr(comma1 + 1, comma2 - comma1 - 1);
            m.fields["extra"] = raw.substr(comma2 + 1);
        }
        return m;
    });

    auto metadata = extractor.extract("DEV003,3.0.0,customField", "typeC");

    EXPECT_TRUE(metadata.parseSuccessful);
    EXPECT_EQ(metadata.deviceId, "DEV003");
    EXPECT_EQ(metadata.firmwareVersion, "3.0.0");
    EXPECT_EQ(metadata.fields["extra"], "customField");
}

TEST_F(MetadataExtractorTest, ListsRegisteredParsers) {
    auto parsers = extractor.getRegisteredTypes();

    // Built-in: typeA, typeB
    EXPECT_GE(parsers.size(), 2u);
    EXPECT_NE(std::find(parsers.begin(), parsers.end(), "typeA"), parsers.end());
    EXPECT_NE(std::find(parsers.begin(), parsers.end(), "typeB"), parsers.end());
}
