import { Construct } from 'constructs';
import { Chart, ChartProps, Helm } from 'cdk8s';
import { Certificate, Issuer } from '../../imports/cert-manager.io';
import { ConfigMap, Secret } from 'cdk8s-plus-26';
import { HelmChartConfig } from '../../imports/helm.cattle.io';

interface CertManagerProps extends ChartProps {
    acme: {
        email: string;
        server?: string;
    }

    cloudflareAccountKey: string;

    /**
     * Namespace in which the traefik is installed.
     * Issuer and Certificate CRDs will be created here.
     * @default kube-system
     */
    traefikNamespace?: string;
}

export class Domain {
    readonly root: string;
    readonly fqdn: string;

    constructor(root: string, fqdn: string) {
        this.root = root;
        this.fqdn = fqdn;
    }
}

export class CertManager extends Chart {
    issuer: Issuer;
    domains: string[];

    private traefikNamespace: string;

    constructor(scope: Construct, id: string, props: CertManagerProps) {
        super(scope, id, props);

        this.traefikNamespace = props.traefikNamespace || 'kube-system';
        this.domains = [];

        const manager = new Helm(this, id, {
            releaseName: id,
            namespace: props.namespace,
            chart: "cert-manager",
            version: "v1.11.1",
            repo: "https://charts.jetstack.io",
            values: {
                installCRDs: true
            }
        });

        const cloudflareToken = new Secret(this, 'cloudflare-token', {});
        cloudflareToken.addStringData("token", props.cloudflareAccountKey);

        this.issuer = new Issuer(this, 'cloudflare', {
            metadata: {
                namespace: this.traefikNamespace
            },
            spec: {
                acme: {
                    email: props.acme.email,
                    server: props.acme.server || "https://acme-v02.api.letsencrypt.org/directory",
                    privateKeySecretRef: {
                        name: "cloudflare-issuer-account-key"
                    },
                    solvers: [{
                        dns01: {
                            cloudflare: {
                                apiTokenSecretRef: {
                                    name: cloudflareToken.name,
                                    key: "token"
                                }
                            }
                        }
                    }]
                }
            }
        });

        this.issuer.addDependency(manager);
    }

    registerDomain(fqdn: string): Domain {
        const components = fqdn.split('.').reverse();
        if (components.length > 3) throw 'Domains with more than one subdomain level are not supported';
        const root = components.splice(0, 2).reverse().join('.');

        if (this.domains.indexOf(root) === -1) {
            const dnsNames = [root, `*.${root}`];

            new Certificate(this, root, {
                metadata: {
                    namespace: this.traefikNamespace
                },
                spec: {
                    secretName: this.secretName(root),
                    commonName: root,
                    dnsNames,
                    issuerRef: {
                        kind: this.issuer.kind, // TODO Not sure if this works! Might include apiGroup?
                        name: this.issuer.name
                    }
                }
            });

            this.domains.push(root);
        }

        return new Domain(root, fqdn);
    }

    override toJson(): any[] {
        const config = this.domains.map(root => `
[[tls.certificates]]
certFile = "/certs/${root}/tls.crt"
keyFile = "/certs/${root}/tls.key"`).join('\n');

        const values = TRAEFIK_VALUES_HEAD + this.domains.map(root => `
  - name: ${this.secretName(root)}
    mountPath: "/certs/${root}"
    type: secret`).join('\n');

        new ConfigMap(this, 'traefik-config', {
            metadata: {
                name: "traefik-cert-config",
                namespace: this.traefikNamespace
            },
            data: {
                "dynamic.toml": config
            }
        });

        new HelmChartConfig(this, 'traefik-values', {
            metadata: {
                name: "traefik",
                namespace: this.traefikNamespace
            },
            spec: {
                valuesContent: values
            }
        });

        return super.toJson();
    }

    private secretName(root: string): string {
        return `tls-${root}`
    }
}

const TRAEFIK_VALUES_HEAD = `
additionalArguments:
  - "--providers.file.filename=/config/dynamic.toml"
ports:
  websecure:
    http3:
      enabled: true
      advertisedPort: 443
volumes:
  - name: traefik-cert-config
    mountPath: "/config"
    type: configMap
`;