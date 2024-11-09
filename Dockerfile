FROM node:23-bookworm

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    ; \
    rm -rf /var/lib/apt/lists/*

RUN curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | VERIFY_CHECKSUM=false bash

# Preinstall some heavy stuff so the actual pipeline runs a lil' faster
RUN yarn global add cdk8s-cli@^2.2.43 ts-node@^10.9.1 argon2@^0.41.1

ENTRYPOINT ["/bin/sh"]
