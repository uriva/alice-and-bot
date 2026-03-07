#!/bin/bash
sudo apt-get update
sudo apt-get install -y docker.io
# Fetch Google Cloud credentials for Container Registry so it can pull the image
gcloud auth configure-docker --quiet
sudo docker run -d \
    --name bridge \
    --network host \
    --restart always \
    gcr.io/movie-quotes-368212/webrtc-bridge:latest
