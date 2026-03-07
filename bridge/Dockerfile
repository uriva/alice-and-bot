FROM denoland/deno:latest

WORKDIR /app

# Prefer not to run as root.
USER deno

# Cache the dependencies as a layer
COPY deno.json deno.lock ./
COPY main.ts ./
RUN deno cache main.ts

# These are passed as runtime flags to deno run
CMD ["run", "-A", "main.ts"]
