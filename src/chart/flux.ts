import { Construct } from 'constructs';
import { ApiObject, Chart, ChartProps, Include, JsonPatch } from 'cdk8s';
import { ContainerRegistry } from '../lib/helpers/db/oci';
import { generateSecret } from '../helpers';
import { Ingress, IngressBackend, Secret } from 'cdk8s-plus-26';
import { Domain } from '../lib/infra/certManager';
import { KubeNetworkPolicy } from '../imports/k8s';
import { OciRepository } from '../imports/source.toolkit.fluxcd.io';
import { Kustomization, KustomizationSpecSourceRefKind } from '../imports/kustomize.toolkit.fluxcd.io';
import { attachMiddlewares, restrictToLocalNetwork } from '../network';

interface FluxProps extends ChartProps {
    registryDomain: Domain,

    image: string;
    tag?: string;
}

export class Flux extends Chart {
    constructor(scope: Construct, id: string, props: FluxProps) {
        super(scope, id, props);

        new Include(this, 'flux', {
            url: 'https://github.com/fluxcd/flux2/releases/download/v2.0.0-rc.1/install.yaml',
        });

        const password = generateSecret(`flux-${id}-registry`, 64);

        const registry = new ContainerRegistry(this, 'registry', {
            user: 'flux',
            password
        });

        const registryIngress = new Ingress(this, props.registryDomain.fqdn, {
            rules: [{
                host: props.registryDomain.fqdn,
                backend: IngressBackend.fromService(registry.service)
            }]
        });

        attachMiddlewares(registryIngress, [restrictToLocalNetwork(this)]);

        new KubeNetworkPolicy(this, 'allow-registry', {
            spec: {
                ingress: [{
                    from: [{
                        namespaceSelector: {
                            matchLabels: {
                                "kubernetes.io/metadata.name": "infra"
                            }
                        }
                    }]
                }],
                podSelector: {
                    matchLabels: registry.statefulSet.matchLabels
                },
                policyTypes: ["Ingress"]
            }
        });

        const secret = new Secret(this, 'registry-password', {
            type: 'kubernetes.io/dockerconfigjson'
        });

        ApiObject.of(secret).addJsonPatch(JsonPatch.add("/data", { ".dockerconfigjson": registry.generateDockerConfig(props.registryDomain) }));

        const repo = new OciRepository(this, 'registry-ci', {
            spec: {
                interval: '1m',
                url: `oci://${props.registryDomain.fqdn}/${props.image}`,
                ref: { tag: props.tag },
                secretRef: { name: secret.name },
                insecure: true
            }
        });

        new Kustomization(this, 'cluster', {
            spec: {
                timeout: '2m',
                interval: '1m',
                retryInterval: '2m',
                path: './',
                prune: true,
                wait: true,
                sourceRef: {
                    kind: KustomizationSpecSourceRefKind.OCI_REPOSITORY,
                    name: repo.name
                }
            }
        });
    }
}
