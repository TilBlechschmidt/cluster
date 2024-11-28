import { Construct } from 'constructs';
import { Helm, Include } from 'cdk8s';
import { resolveNamespace } from '../../helpers';

export class Traefik extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const accessLog = {
            logs: {
                access: {
                    enabled: true,
                    filePath: '/var/log/traefik/access.log',
                }
            },
            additionalVolumeMounts: [{
                name: "access-logs",
                mountPath: "/var/log/traefik"
            }],
            deployment: {
                additionalVolumes: [{
                    name: "access-logs",
                    hostPath: {
                        path: "/var/log/traefik",
                        type: "DirectoryOrCreate"
                    }
                }]
            },
            additionalArguments: [
                "--accessLog.filters.statusCodes=400-499",
            ]
        };

        const externalTrafficPolicy = {
            service: {
                spec: {
                    externalTrafficPolicy: "Local",
                }
            }
        };

        const timeouts = {
            ports: {
                web: {
                    transport: {
                        respondingTimeouts: {
                            readTimeout: '600s',
                            writeTimeout: '600s',
                            idleTimeout: '180s',
                        }
                    }
                },
                websecure: {
                    transport: {
                        respondingTimeouts: {
                            readTimeout: '600s',
                            writeTimeout: '600s',
                            idleTimeout: '180s',
                        }
                    }
                },
            }
        };

        // TODO Add HTTP3 config (actually needs proper IPv6 setup to work ... ugh)
        //
        // ports:
        //   websecure:
        //     http3:
        //       enabled: true
        //       advertisedPort: 443

        for (let crd of CRDS) {
            new Include(this, `crd-${crd}`, {
                url: `vendor/traefik/${crd}`
            });
        }

        new Helm(this, id, {
            releaseName: id,
            namespace: resolveNamespace(scope),
            chart: "traefik",
            version: "v33.0.0",
            repo: "https://traefik.github.io/charts",
            values: {
                ...accessLog,
                ...externalTrafficPolicy,
                ...timeouts,
            }
        });
    }
}

// Too lazy to implement directory enumeration lol
const CRDS = [
    "hub.traefik.io_accesscontrolpolicies.yaml",
    "hub.traefik.io_apis.yaml",
    "hub.traefik.io_apiaccesses.yaml",
    "hub.traefik.io_apiversions.yaml",
    "hub.traefik.io_apibundles.yaml",
    "hub.traefik.io_apiplans.yaml",
    "hub.traefik.io_apiportals.yaml",
    "hub.traefik.io_apiratelimits.yaml",
    "traefik.io_middlewaretcps.yaml",
    "traefik.io_serverstransports.yaml",
    "traefik.io_ingressroutes.yaml",
    "traefik.io_serverstransporttcps.yaml",
    "traefik.io_ingressroutetcps.yaml",
    "traefik.io_tlsoptions.yaml",
    "traefik.io_ingressrouteudps.yaml",
    "traefik.io_tlsstores.yaml",
    "traefik.io_middlewares.yaml",
    "traefik.io_traefikservices.yaml",
];