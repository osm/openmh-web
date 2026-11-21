# syntax=docker/dockerfile:1
ARG UBUNTU_IMAGE=ubuntu:26.04

FROM ${UBUNTU_IMAGE} AS build-tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Named build contexts replace these empty defaults with read-only inputs.
FROM scratch AS runtime
FROM scratch AS content

FROM build-tools AS website-build
WORKDIR /src
COPY . .
ARG SITE_ARGS=
ENV SITE_ARGS=${SITE_ARGS}
RUN --mount=type=bind,from=runtime,target=/runtime \
    --mount=type=bind,from=content,target=/content \
    python3 -B docker/build.py

FROM scratch AS site
COPY --from=website-build /out/site/ /site/

FROM scratch AS release
COPY --from=website-build /out/ /
