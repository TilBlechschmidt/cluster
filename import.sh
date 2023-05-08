#!/bin/sh
yarn run import k8s@1.26.0
yarn run import https://raw.githubusercontent.com/traefik/traefik/v2.9.4/docs/content/reference/dynamic-configuration/kubernetes-crd-definition-v1.yml
yarn run import https://github.com/cert-manager/cert-manager/releases/download/v1.11.1/cert-manager.crds.yaml
yarn run import https://github.com/k3s-io/helm-controller/releases/download/v0.13.3/deploy-cluster-scoped.yaml
yarn run import https://github.com/fluxcd/flux2/releases/latest/download/install.yaml
