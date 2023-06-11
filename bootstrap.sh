#!/bin/sh

# Synthesize the bootstrap & cluster manifests
yarn install --dev
BOOTSTRAP=1 yarn synth

# Apply the bootstrap manifests to deploy flux
kubectl apply -f dist/bootstrap/flux.k8s.yaml

# Push the cluster manifests to the flux OCI registry
kubectl port-forward -n flux-system service/flux-registry 5000:5000 &

flux push artifact oci://127.0.0.1:5000/ci:latest \
    --path="dist/cluster" \
    --source="https://tibl.dev" \
    --revision="0" \
    --creds flux:<insert-password-stolen-from-flux-yaml-here>

# Watch the magic happening
kubectl get ocirepo -w &
kubectl get kustomization -w

# Setup secrets for concourse
kubectl -n concourse-main create secret generic cdk8s --from-file=value=secrets.json
kubectl -n concourse-main create secret generic registry --from-file=value=registry.txt

# Ensure the manifests are built automagically in the future
fly set-pipeline -p cdk8s -c ci/pipeline.yml
