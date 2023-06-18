import { ConfigMap, Env, Ingress, IngressBackend, Secret, Service, ServiceType, StatefulSet } from "cdk8s-plus-26";
import { Construct } from "constructs";
import { createHostPathVolume } from "../../helpers";
import { Authelia } from "../infra/authelia";
import { Domain } from "../infra/certManager";

const API_PORT = 9010;
const CONSOLE_PORT = 9011;

interface MinioProps {
    readonly domain: Domain;
    readonly adminDomain?: Domain;

    readonly root?: {
        readonly user: string;
        readonly password: string;
    };

    readonly oidc: Authelia;
}

export class Minio extends Construct {
    constructor(scope: Construct, id: string, props: MinioProps) {
        super(scope, id);

        const configMap = new ConfigMap(this, 'config');
        const secret = new Secret(this, 'secrets');

        configMap.addData('MINIO_SERVER_URL', `https://${props.domain.fqdn}`);

        if (props.root) {
            secret.addStringData('MINIO_ROOT_USER', props.root.user)
            secret.addStringData('MINIO_ROOT_PASSWORD', props.root.password);
        } else if (props.adminDomain) {
            const oidcSecret = props.oidc.registerClient(id, {
                description: "Minio",
                redirect_uris: [`https://${props.adminDomain.fqdn}/oauth_callback`],
                authorization_policy: 'one_factor'
            });

            configMap.addData('MINIO_API_ROOT_ACCESS', 'off');
            configMap.addData('MINIO_BROWSER_REDIRECT_URL', `https://${props.adminDomain.fqdn}`);
            configMap.addData('MINIO_IDENTITY_OPENID_CONFIG_URL', props.oidc.discoveryUrl);
            configMap.addData('MINIO_IDENTITY_OPENID_CLIENT_ID', id);
            configMap.addData('MINIO_IDENTITY_OPENID_SCOPES', 'openid,profile,email,groups');
            configMap.addData('MINIO_IDENTITY_OPENID_CLAIM_NAME', 'groups');
            configMap.addData('MINIO_IDENTITY_OPENID_CLAIM_USERINFO', 'on');
            configMap.addData('MINIO_IDENTITY_OPENID_DISPLAY_NAME', 'Authelia');
            secret.addStringData('MINIO_IDENTITY_OPENID_CLIENT_SECRET', oidcSecret);
        } else {
            throw "Minio configured with neither OIDC nor root user.";
        }

        // Skips the temporary server startup, prevents "port in use" errors
        configMap.addData('MINIO_SKIP_CLIENT', 'yes');
        configMap.addData('BITNAMI_DEBUG', 'true');
        configMap.addData('MINIO_API_PORT_NUMBER', `${API_PORT}`);
        configMap.addData('MINIO_CONSOLE_PORT_NUMBER', `${CONSOLE_PORT}`);

        const envFrom = [
            Env.fromConfigMap(configMap),
            Env.fromSecret(secret)
        ];

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [
                { port: API_PORT, targetPort: API_PORT, name: 's3' },
                { port: CONSOLE_PORT, targetPort: CONSOLE_PORT, name: 'console' }
            ]
        });

        const statefulSet = new StatefulSet(this, 'app', { service });

        const container = statefulSet.addContainer({
            image: 'bitnami/minio:2023.6.9-debian-11-r2',
            ports: [
                { name: 's3', number: API_PORT },
                { name: 'console', number: CONSOLE_PORT }
            ],
            envFrom,
            securityContext: {
                readOnlyRootFilesystem: false
            },
            resources: {}
        });

        container.mount('/data', createHostPathVolume(this, 'data'));

        new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service, { port: API_PORT })
            }]
        });

        if (props.adminDomain) {
            new Ingress(this, props.adminDomain.fqdn, {
                rules: [{
                    host: props.adminDomain.fqdn,
                    backend: IngressBackend.fromService(service, { port: CONSOLE_PORT })
                }]
            });
        }
    }
}
