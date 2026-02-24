FROM gcc:13

RUN apt-get update && apt-get install -y cmake && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY CMakeLists.txt ./
COPY src/ ./src/
COPY tests/ ./tests/

RUN cmake -B build && cmake --build build

CMD ["ctest", "--test-dir", "build", "--output-on-failure"]
