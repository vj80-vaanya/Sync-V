#include "MetadataExtractor.h"
#include <sstream>
#include <algorithm>

namespace syncv {

MetadataExtractor::MetadataExtractor() {
    parsers_["typeA"] = parseTypeA;
    parsers_["typeB"] = parseTypeB;
}

DeviceMetadata MetadataExtractor::extract(const std::string& rawData,
                                           const std::string& deviceType) {
    auto it = parsers_.find(deviceType);
    if (it == parsers_.end()) {
        DeviceMetadata m;
        m.deviceType = deviceType;
        m.parseSuccessful = false;
        return m;
    }

    auto metadata = it->second(rawData);
    metadata.deviceType = deviceType;
    return metadata;
}

void MetadataExtractor::registerParser(const std::string& deviceType, ParserFunction parser) {
    parsers_[deviceType] = std::move(parser);
}

std::vector<std::string> MetadataExtractor::getRegisteredTypes() const {
    std::vector<std::string> types;
    for (const auto& pair : parsers_) {
        types.push_back(pair.first);
    }
    return types;
}

DeviceMetadata MetadataExtractor::parseTypeA(const std::string& raw) {
    // Type A: key=value format, one per line
    DeviceMetadata m;

    if (raw.empty()) {
        m.parseSuccessful = false;
        return m;
    }

    std::istringstream stream(raw);
    std::string line;
    bool foundAnyValid = false;

    while (std::getline(stream, line)) {
        if (line.empty()) continue;

        auto eqPos = line.find('=');
        if (eqPos == std::string::npos || eqPos == 0) continue;

        std::string key = line.substr(0, eqPos);
        std::string value = line.substr(eqPos + 1);

        // Trim whitespace
        key.erase(key.find_last_not_of(" \t\r\n") + 1);
        key.erase(0, key.find_first_not_of(" \t\r\n"));
        value.erase(value.find_last_not_of(" \t\r\n") + 1);
        value.erase(0, value.find_first_not_of(" \t\r\n"));

        if (key == "device_id") {
            m.deviceId = value;
        } else if (key == "firmware_version") {
            m.firmwareVersion = value;
        } else {
            m.fields[key] = value;
        }
        foundAnyValid = true;
    }

    m.parseSuccessful = foundAnyValid && !m.deviceId.empty();
    return m;
}

DeviceMetadata MetadataExtractor::parseTypeB(const std::string& raw) {
    // Type B: Simple JSON format (hand-parsed to avoid external dependency)
    DeviceMetadata m;

    if (raw.empty() || raw[0] != '{') {
        m.parseSuccessful = false;
        return m;
    }

    // Find matching closing brace
    if (raw.back() != '}') {
        m.parseSuccessful = false;
        return m;
    }

    // Simple JSON key-value parser (flat objects only)
    std::string content = raw.substr(1, raw.size() - 2);

    auto parseString = [](const std::string& s, size_t& pos) -> std::string {
        if (pos >= s.size() || s[pos] != '"') return "";
        pos++; // skip opening quote
        std::string result;
        while (pos < s.size() && s[pos] != '"') {
            if (s[pos] == '\\' && pos + 1 < s.size()) {
                pos++;
            }
            result += s[pos++];
        }
        if (pos < s.size()) pos++; // skip closing quote
        return result;
    };

    auto parseValue = [](const std::string& s, size_t& pos) -> std::string {
        if (pos >= s.size()) return "";
        if (s[pos] == '"') {
            pos++;
            std::string result;
            while (pos < s.size() && s[pos] != '"') {
                result += s[pos++];
            }
            if (pos < s.size()) pos++;
            return result;
        }
        // Number or literal
        std::string result;
        while (pos < s.size() && s[pos] != ',' && s[pos] != '}') {
            result += s[pos++];
        }
        return result;
    };

    size_t pos = 0;
    bool foundAny = false;

    while (pos < content.size()) {
        // Skip whitespace and commas
        while (pos < content.size() && (content[pos] == ' ' || content[pos] == ',' ||
               content[pos] == '\n' || content[pos] == '\t' || content[pos] == '\r')) {
            pos++;
        }
        if (pos >= content.size()) break;

        std::string key = parseString(content, pos);
        if (key.empty()) break;

        // Skip colon
        while (pos < content.size() && (content[pos] == ' ' || content[pos] == ':')) pos++;

        std::string value = parseValue(content, pos);

        if (key == "id") {
            m.deviceId = value;
        } else if (key == "fw") {
            m.firmwareVersion = value;
        } else {
            m.fields[key] = value;
        }
        foundAny = true;
    }

    m.parseSuccessful = foundAny && !m.deviceId.empty();
    return m;
}

} // namespace syncv
