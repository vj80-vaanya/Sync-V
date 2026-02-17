cmake_minimum_required(VERSION 3.14)
project(SyncVDrive VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Fetch GoogleTest
include(FetchContent)
FetchContent_Declare(
  googletest
  URL https://github.com/google/googletest/archive/refs/tags/v1.14.0.zip
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

# Fetch OpenSSL-compatible crypto: use a lightweight header-only approach
# For portability, we bundle a minimal SHA256 and AES implementation

# Library sources
add_library(syncv_drive STATIC
    src/LogCollector.cpp
    src/HashVerifier.cpp
    src/EncryptedStorage.cpp
    src/MetadataExtractor.cpp
    src/WiFiServer.cpp
    src/FirmwareReceiver.cpp
    src/TransferManager.cpp
)
target_include_directories(syncv_drive PUBLIC src)

# Enable testing
enable_testing()

# Test executables
set(TEST_SOURCES
    tests/test_log_collector.cpp
    tests/test_hash_verifier.cpp
    tests/test_encrypted_storage.cpp
    tests/test_metadata_extractor.cpp
    tests/test_wifi_server.cpp
    tests/test_firmware_receiver.cpp
    tests/test_transfer_manager.cpp
)

foreach(TEST_SRC ${TEST_SOURCES})
    get_filename_component(TEST_NAME ${TEST_SRC} NAME_WE)
    add_executable(${TEST_NAME} ${TEST_SRC})
    target_link_libraries(${TEST_NAME} syncv_drive GTest::gtest_main)
    add_test(NAME ${TEST_NAME} COMMAND ${TEST_NAME})
endforeach()
