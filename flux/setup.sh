k apply -f https://github.com/fluxcd/flux2/releases/latest/download/install.yaml
k apply -f registry.yml

k port-forward service/registry 5001:80 --address 0.0.0.0

flux push artifact oci://127.0.0.1:5001/ci:latest \
    --path="../dist/k8s" \
    --source="https://blechschmidt.dev" \
    --revision="test-3"

k apply -f flux.yml

flux build artifact \
    --path "../dist/k8s" \
    --output /tmp/bla/artifact.tgz

# flux push artifact oci://registry.flux-system/ci:$(git rev-parse --short HEAD) \
#     --path="../dist/k8s" \
#     --source="$(git config --get remote.origin.url)" \
#     --revision="$(git branch --show-current)/$(git rev-parse HEAD)"

# flux tag artifact oci://registry.flux-system/ci:$(git rev-parse --short HEAD) \
#   --tag latest
