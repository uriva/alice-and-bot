#!/bin/bash
sudo apt-get update
sudo apt-get install -y docker.io
# Fetch Google Cloud credentials for Container Registry so it can pull the image
gcloud auth configure-docker --quiet
sudo docker run -d \
    --name bridge \
    --network host \
    --restart always \
    gcr.io/alice-and-bot/webrtc-bridge:latest
# TLS front for Twilio media streams (Deno Deploy edge cannot accept Twilio's WSS handshake)
sudo docker run -d \
    --name caddy \
    --network host \
    --restart always \
    -v caddy_data:/data \
    -v caddy_config:/config \
    -v /home/uri/twilio.Caddyfile:/etc/caddy/Caddyfile:ro \
    caddy:2 caddy run --config /etc/caddy/Caddyfile --admin off
