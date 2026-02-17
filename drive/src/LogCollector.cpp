#include "LogCollector.h"
#include <filesystem>
#include <fstream>
#include <sstream>

namespace fs = std::filesystem;

namespace syncv {

std::vector<LogEntry> LogCollector::collectFromDirectory(const std::string& directory,
                                                          bool recursive) {
    std::vector<LogEntry> logs;

    if (!fs::exists(directory) || !fs::is_directory(directory)) {
        return logs;
    }

    auto processEntry = [&](const fs::directory_entry& entry) {
        if (!entry.is_regular_file()) return;

        LogEntry log;
        log.filename = entry.path().filename().string();
        log.fullPath = entry.path().string();
        log.fileSize = static_cast<uint64_t>(entry.file_size());

        std::ifstream file(entry.path(), std::ios::binary);
        if (file.is_open()) {
            std::ostringstream ss;
            ss << file.rdbuf();
            log.content = ss.str();
        }

        logs.push_back(std::move(log));
    };

    if (recursive) {
        for (const auto& entry : fs::recursive_directory_iterator(directory)) {
            processEntry(entry);
        }
    } else {
        for (const auto& entry : fs::directory_iterator(directory)) {
            processEntry(entry);
        }
    }

    return logs;
}

} // namespace syncv
