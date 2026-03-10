FROM denoland/deno:latest

WORKDIR /app

# Prefer not to run as root.
USER deno

# Cache the dependencies as a layer
COPY deno.json ./
COPY main.ts ./
RUN deno cache --no-lock main.ts

# These are passed as runtime flags to deno run
CMD ["run", "-A", "--no-lock", "main.ts"]
