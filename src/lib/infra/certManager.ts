import { Construct } from 'constructs';
import { Helm, Lazy } from 'cdk8s';
import { Certificate, Issuer } from '../../imports/cert-manager.io';
import { ConfigMap, Secret } from 'cdk8s-plus-26';
import { HelmChartConfig } from '../../imports/helm.cattle.io';
import { resolveNamespace } from '../../helpers';

interface CertManagerProps {
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
    readonly path?: string;

    constructor(fqdn: string, path?: string) {
        const components = fqdn.split('.').reverse();
        if (components.length > 3) throw 'Domains with more than one subdomain level are not supported';
        const root = components.splice(0, 2).reverse().join('.');

        if (path && !path.startsWith('/')) throw 'Domain path has to start with a `/`';

        this.root = root;
        this.fqdn = fqdn;
        this.path = path;
    }
}

export class CertManager extends Construct {
    issuer: Issuer;
    domains: string[];

    private traefikNamespace: string;

    constructor(scope: Construct, id: string, props: CertManagerProps) {
        super(scope, id);

        this.traefikNamespace = props.traefikNamespace || 'kube-system';
        this.domains = [];

        const manager = new Helm(this, id, {
            releaseName: id,
            namespace: resolveNamespace(scope),
            chart: "cert-manager",
            version: "v1.11.1",
            repo: "https://charts.jetstack.io",
            values: {
                installCRDs: true
            }
        });

        const cloudflareToken = new Secret(this, 'cloudflare-token', {
            metadata: {
                name: 'cloudflare',
                namespace: this.traefikNamespace
            }
        });
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

        new ConfigMap(this, 'traefik-config', {
            metadata: {
                name: "traefik-cert-config",
                namespace: this.traefikNamespace
            },
            data: {
                "dynamic.toml": Lazy.any({ produce: () => this._synthConfig() })
            }
        });

        new HelmChartConfig(this, 'traefik-values', {
            metadata: {
                name: "traefik",
                namespace: this.traefikNamespace
            },
            spec: {
                valuesContent: Lazy.any({ produce: () => this._synthValues() })
            }
        });
    }

    registerDomain(fqdn: string): Domain {
        const domain = new Domain(fqdn);
        const root = domain.root;

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

        return domain;
    }

    _synthConfig(): string {
        return this.domains.map(root => `
[[tls.certificates]]
certFile = "/certs/${root}/tls.crt"
keyFile = "/certs/${root}/tls.key"`).join('\n');
    }

    _synthValues(): string {
        return TRAEFIK_VALUES_HEAD + this.domains.map(root => `
  - name: ${this.secretName(root)}
    mountPath: "/certs/${root}"
    type: secret`).join('\n');
    }

    private secretName(root: string): string {
        return `tls-${root}`
    }
}

const TRAEFIK_VALUES_HEAD = `
logs:
  access:
    enabled: true
    filePath: /var/log/traefik/access.log
service:
  spec:
    externalTrafficPolicy: Local
additionalArguments:
  - "--providers.file.filename=/config/dynamic.toml"
  - "--accessLog.filters.statusCodes=400-499"
ports:
  websecure:
    http3:
      enabled: true
      advertisedPort: 443
additionalVolumeMounts:
  - mountPath: /var/log/traefik
    name: access-logs
deployment:
  additionalVolumes:
    - name: access-logs
      hostPath:
        path: /var/log/traefik
        type: DirectoryOrCreate
volumes:
  - name: traefik-cert-config
    mountPath: "/config"
    type: configMap
`;