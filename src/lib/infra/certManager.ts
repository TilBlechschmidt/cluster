import { Construct } from 'constructs';
import { Helm, Lazy } from 'cdk8s';
import { Certificate, Issuer } from '../../imports/cert-manager.io';
import { Secret } from 'cdk8s-plus-26';
import { resolveNamespace } from '../../helpers';
import { TlsStore } from '../../imports/traefik.io';

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
                installCRDs: true,
                extraArgs: [
                    '--dns01-recursive-nameservers="1.1.1.1:53"',
                    '--dns01-recursive-nameservers="1.0.0.1:53"',
                    '--dns01-recursive-nameservers-only'
                ]
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

        new TlsStore(this, 'tls', {
            metadata: {
                name: 'default',
                namespace: this.traefikNamespace,
            },
            spec: {
                certificates: Lazy.any({
                    produce: () => this.domains.map(root => ({ secretName: this.secretName(root) }))
                })
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

    private secretName(root: string): string {
        return `tls-${root}`
    }
}
