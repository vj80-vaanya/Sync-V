#pragma once

#include <string>
#include <map>
#include <vector>
#include <functional>

namespace syncv {

struct DeviceMetadata {
    std::string deviceId;
    std::string deviceType;
    std::string firmwareVersion;
    std::map<std::string, std::string> fields;
    bool parseSuccessful = false;
};

using ParserFunction = std::function<DeviceMetadata(const std::string&)>;

class MetadataExtractor {
public:
    MetadataExtractor();

    /// Extract metadata from raw data using the appropriate parser for deviceType.
    DeviceMetadata extract(const std::string& rawData, const std::string& deviceType);

    /// Register a custom parser for a device type.
    void registerParser(const std::string& deviceType, ParserFunction parser);

    /// Get list of registered device type parsers.
    std::vector<std::string> getRegisteredTypes() const;

private:
    std::map<std::string, ParserFunction> parsers_;

    static DeviceMetadata parseTypeA(const std::string& raw);
    static DeviceMetadata parseTypeB(const std::string& raw);
};

} // namespace syncv
