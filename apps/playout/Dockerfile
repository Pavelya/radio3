FROM savonet/liquidsoap:v2.2.3

# Switch to root for package installation
USER root

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create directories
RUN mkdir -p /var/log/liquidsoap /var/run/liquidsoap /radio/audio

# Copy scripts
COPY radio.liq /radio/radio.liq
COPY fetch-next.sh /radio/fetch-next.sh
RUN chmod +x /radio/fetch-next.sh

WORKDIR /radio

CMD ["liquidsoap", "/radio/radio.liq"]
