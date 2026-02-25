cmake_minimum_required(VERSION 3.14)
project(SyncVDrive VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(BUILD_TESTING "Build test executables" ON)

# Fetch GoogleTest (only when building tests)
if(BUILD_TESTING)
    include(FetchContent)
    FetchContent_Declare(
      googletest
      URL https://github.com/google/googletest/archive/refs/tags/v1.14.0.zip
    )
    set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
    FetchContent_MakeAvailable(googletest)
endif()

# Library sources
add_library(syncv_drive STATIC
    src/LogCollector.cpp
    src/HashVerifier.cpp
    src/EncryptedStorage.cpp
    src/MetadataExtractor.cpp
    src/WiFiServer.cpp
    src/FirmwareReceiver.cpp
    src/TransferManager.cpp
    src/UsbGadget.cpp
)
target_include_directories(syncv_drive PUBLIC src)

# Main executable
add_executable(syncv_drive_bin src/main.cpp)
target_link_libraries(syncv_drive_bin syncv_drive)
set_target_properties(syncv_drive_bin PROPERTIES OUTPUT_NAME syncv-drive)

# Install rules (for cross-compile deploy)
install(TARGETS syncv_drive_bin RUNTIME DESTINATION bin)

# Tests (skipped when cross-compiling with -DBUILD_TESTING=OFF)
if(BUILD_TESTING)
    enable_testing()

    set(TEST_SOURCES
        tests/test_log_collector.cpp
        tests/test_hash_verifier.cpp
        tests/test_encrypted_storage.cpp
        tests/test_metadata_extractor.cpp
        tests/test_wifi_server.cpp
        tests/test_firmware_receiver.cpp
        tests/test_transfer_manager.cpp
        tests/test_usb_gadget.cpp
    )

    foreach(TEST_SRC ${TEST_SOURCES})
        get_filename_component(TEST_NAME ${TEST_SRC} NAME_WE)
        add_executable(${TEST_NAME} ${TEST_SRC})
        target_link_libraries(${TEST_NAME} syncv_drive GTest::gtest_main)
        add_test(NAME ${TEST_NAME} COMMAND ${TEST_NAME})
    endforeach()
endif()
