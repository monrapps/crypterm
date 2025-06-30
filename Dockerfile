# libwebsockets build stage
FROM debian:bullseye as libwebsockets-builder

# Install dependencies to build libwebsockets
RUN apt-get update && apt-get install -y \
    cmake \
    make \
    gcc \
    git \
    libssl-dev \
    zlib1g-dev \
    libuv1-dev

# Clone and build libwebsockets with libuv support
RUN git clone -b v4.3-stable https://github.com/warmcat/libwebsockets.git \
    && cd libwebsockets \
    && mkdir build \
    && cd build \
    && cmake .. -DLWS_WITH_LIBUV=ON \
    && make \
    && make install

# ttyd build stage
FROM debian:bullseye as ttyd-builder

# Install dependencies to build ttyd
RUN apt-get update && apt-get install -y \
    cmake \
    make \
    gcc \
    git \
    libjson-c-dev \
    libssl-dev \
    libuv1-dev \
    zlib1g-dev

# Copy the compiled libwebsockets from the previous stage
COPY --from=libwebsockets-builder /usr/local /usr/local

# Update the linker cache
RUN ldconfig

# Clone and build ttyd
RUN git clone https://github.com/tsl0922/ttyd.git \
    && cd ttyd \
    && mkdir build \
    && cd build \
    && cmake .. \
    && make \
    && make install

# Final stage
FROM node:16.14.0-bullseye

# Copy ttyd and its dependencies from the previous stage
COPY --from=ttyd-builder /usr/local /usr/local

# Install necessary runtime libraries
RUN apt-get update && apt-get install -y \
    libuv1 \
    libjson-c5 \
    libssl1.1 \
    zlib1g \
    && ldconfig \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy the application code to the container
COPY src/ .

# Install Node.js application dependencies
RUN npm install

# Set the default port and expose it
ENV PORT=6514
EXPOSE ${PORT}

# Command to start ttyd with the Node.js application
CMD ["sh", "-c", "ttyd -p ${PORT} node index.js"]