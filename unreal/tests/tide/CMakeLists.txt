# Standalone build of the engine-independent tide core, checked against the TypeScript fixtures.
#   cmake -S unreal/tests/tide -B build/tide && cmake --build build/tide && ctest --test-dir build/tide
cmake_minimum_required(VERSION 3.16)
project(HigataTideGolden CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(TIDE_MODULE ${CMAKE_CURRENT_SOURCE_DIR}/../../HigataZukan/Source/HigataTide)

add_executable(tide_golden_test
  tide_golden_test.cpp
  ${TIDE_MODULE}/Private/TideCore/TideCore.cpp)
target_include_directories(tide_golden_test PRIVATE ${TIDE_MODULE}/Public)
if(MSVC)
  target_compile_options(tide_golden_test PRIVATE /W4 /WX)
else()
  target_compile_options(tide_golden_test PRIVATE -Wall -Wextra -Wshadow -Wconversion -Werror)
endif()

enable_testing()
file(GLOB FIXTURES ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/*.txt)
add_test(NAME tide_golden COMMAND tide_golden_test ${FIXTURES})
