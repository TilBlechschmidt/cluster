# "Abuse" the authelia image as a way to easily gain access
# to a platform-compatible authelia binary :D
FROM ghcr.io/authelia/authelia:4.37.5 AS authelia

# Continue with the actual image
FROM node:20-alpine3.16

COPY --from=authelia /app/authelia /usr/bin/authelia

RUN apk add --no-cache curl bash
RUN curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | VERIFY_CHECKSUM=false bash
RUN curl -s https://fluxcd.io/install.sh | bash

WORKDIR /cdk8s
COPY package.json .
RUN yarn install --dev

ENTRYPOINT ["/bin/bash"]
