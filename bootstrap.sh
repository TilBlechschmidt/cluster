#!/bin/sh

yarn install --dev
yarn synth

kubectl apply -f dist/bootstrap/flux.k8s.yaml

kubectl port-forward -n flux-system service/flux-registry 5000:5000 &

flux push artifact oci://127.0.0.1:5000/ci:latest \
    --path="dist/cluster" \
    --source="https://blechschmidt.dev" \
    --revision="0" \
    --creds flux:<insert-password-stolen-from-flux-yaml-here>

kubectl get ocirepo -w &
kubectl get kustomization -w
