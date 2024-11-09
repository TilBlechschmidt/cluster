FROM node:23.1.0-alpine3.19

RUN apk add --no-cache curl bash git
RUN curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | VERIFY_CHECKSUM=false bash

RUN yarn global add cdk8s-cli@^2.2.29 ts-node@^10.9.1

ENTRYPOINT ["/bin/bash"]
