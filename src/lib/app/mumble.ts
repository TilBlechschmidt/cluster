import { Env, Protocol, Secret, Service, ServiceType, StatefulSet, Volume } from "cdk8s-plus-26";
import { Construct } from "constructs";
import { createHostPathVolume, generateURLSafeSecret, obj2env } from "../../helpers";
import secrets from '../../../secrets.json';
import { CertManager } from "../infra/certManager";
import { Certificate } from "../../imports/cert-manager.io";

export class Mumble extends Construct {
    constructor(scope: Construct, id: string, certManager: CertManager) {
        super(scope, id);

        const service = new Service(this, id, {
            type: ServiceType.LOAD_BALANCER,
            ports: [
                { name: 'voice-tcp', port: 64738 },
                { name: 'voice-udp', port: 64738, protocol: Protocol.UDP }
            ],
        });

        const mumble = new StatefulSet(this, 'app', {
            service,
            securityContext: {
                fsGroup: 3000,
                user: 1000,
                group: 1000,
            },
        });

        const secret = new Secret(this, 'secrets', {
            stringData: {
                MUMBLE_SUPERUSER_PASSWORD: generateURLSafeSecret(`${id}-superuser-password`, 32),

                MUMBLE_CONFIG_SERVER_PASSWORD: secrets.mumble.password,
                MUMBLE_CONFIG_WELCOME_TEXT: '',

                MUMBLE_CONFIG_SSL_CERT: '/cert/tls.crt',
                MUMBLE_CONFIG_SSL_KEY: '/cert/tls.key',
            }
        });

        const server = mumble.addContainer({
            name: 'server',
            image: 'mumblevoip/mumble-server:v1.5.634',
            ports: [
                { name: 'voice-tcp', number: 64738 },
                { name: 'voice-udp', number: 64738, protocol: Protocol.UDP },
            ],
            envFrom: [Env.fromSecret(secret)],
            envVariables: obj2env({}),
        });

        const certificate = Secret.fromSecretName(this, 'ssl-cert-key', id + '-tls');

        new Certificate(this, 'ssl-cert', {
            spec: {
                secretName: certificate.name,
                commonName: 'tibl.dev',
                dnsNames: ['tibl.dev'],
                issuerRef: {
                    kind: certManager.issuer.kind,
                    name: certManager.issuer.name,
                }
            }
        });

        server.mount('/data', createHostPathVolume(this, 'data'));
        server.mount('/cert', Volume.fromSecret(this, 'ssl', certificate));
    }
}
