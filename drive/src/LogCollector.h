#pragma once

#include <string>
#include <vector>
#include <cstdint>

namespace syncv {

struct LogEntry {
    std::string filename;
    std::string content;
    std::string fullPath;
    uint64_t fileSize = 0;
};

class LogCollector {
public:
    /// Collect all log files from the given directory.
    /// @param directory Path to scan for log files.
    /// @param recursive If true, also scan subdirectories.
    /// @return Vector of LogEntry structs with file content and metadata.
    std::vector<LogEntry> collectFromDirectory(const std::string& directory,
                                                bool recursive = false);
};

} // namespace syncv
