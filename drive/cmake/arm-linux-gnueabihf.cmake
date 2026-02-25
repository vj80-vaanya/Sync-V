# CMake toolchain file for Raspberry Pi Zero W (ARMv6, 32-bit)
# Usage: cmake -B build-pi -DCMAKE_TOOLCHAIN_FILE=cmake/arm-linux-gnueabihf.cmake

set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR arm)

# Cross-compiler (installed via: sudo apt install gcc-arm-linux-gnueabihf g++-arm-linux-gnueabihf)
set(CMAKE_C_COMPILER   arm-linux-gnueabihf-gcc)
set(CMAKE_CXX_COMPILER arm-linux-gnueabihf-g++)

# Target sysroot (optional — set if you have a Pi sysroot)
# set(CMAKE_SYSROOT /path/to/pi-sysroot)

# Search only target paths for libraries/headers, host paths for programs (cmake, etc.)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)

# Pi Zero W = ARMv6 with hardware float (armhf)
set(CMAKE_C_FLAGS   "${CMAKE_C_FLAGS}   -march=armv6zk -marm -mfpu=vfp -mfloat-abi=hard" CACHE STRING "")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -march=armv6zk -marm -mfpu=vfp -mfloat-abi=hard" CACHE STRING "")
