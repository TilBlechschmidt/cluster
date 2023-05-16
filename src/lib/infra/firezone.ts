import { Construct } from 'constructs';
import { ApiObject, JsonPatch, Size } from 'cdk8s';
import * as kplus from 'cdk8s-plus-26';
import { generateSecret } from '../../helpers';
import { Authelia } from './authelia';
import { Postgres } from '../helpers/db/postgres';
import { Domain } from './certManager';
import { PersistentVolumeClaim } from '../helpers/k8s/pvc';

interface FirezoneProps {
    readonly defaultAdminEmail: string;

    readonly domain: Domain;
    readonly port: number;

    readonly oidc: Authelia,
}

export class Firezone extends Construct {
    constructor(scope: Construct, id: string, props: FirezoneProps) {
        super(scope, id);

        const oidcSecret = props.oidc.registerClient(id, {
            description: "Firezone VPN",
            redirect_uris: [`https://${props.domain.fqdn}/auth/oidc/authelia/callback`],
        });

        const oidcProviders = JSON.stringify([
            {
                auto_create_users: true,
                id: "authelia",
                label: "Authelia",
                client_id: "firezone",
                client_secret: oidcSecret,
                discovery_document_uri: props.oidc.discoveryUrl,
                redirect_uri: `https://${props.domain.fqdn}/auth/oidc/authelia/callback`,
                response_type: "code",
                scope: "openid email profile"
            }
        ]);

        const postgresPassword = generateSecret(`${id}-pg`, 16);

        const postgres = new Postgres(this, 'pg', {
            database: CONFIG.DATABASE_NAME,
            user: CONFIG.DATABASE_USER,
            password: postgresPassword,
            storage: Size.gibibytes(1),
            retainClaim: true
        });

        const configMap = new kplus.ConfigMap(this, 'config', {
            data: CONFIG
        });

        configMap.addData("WIREGUARD_PORT", props.port.toString());
        configMap.addData("DATABASE_HOST", postgres.serviceName);
        configMap.addData("EXTERNAL_URL", `https://${props.domain.fqdn}`);

        const secret = new kplus.Secret(this, 'keys', {
            stringData: {
                DEFAULT_ADMIN_EMAIL: props.defaultAdminEmail,
                DEFAULT_ADMIN_PASSWORD: "notinusebecauselocalauthhasbeendisabled",
                GUARDIAN_SECRET_KEY: generateSecret(`firezone-${id}-guardian`, 48),
                SECRET_KEY_BASE: generateSecret(`firezone-${id}-key`, 48),
                LIVE_VIEW_SIGNING_SALT: generateSecret(`firezone-${id}-liveview`, 24),
                COOKIE_SIGNING_SALT: generateSecret(`firezone-salt-${id}-signing`, 6),
                COOKIE_ENCRYPTION_SALT: generateSecret(`firezone-salt-${id}-encr`, 6),
                DATABASE_ENCRYPTION_KEY: generateSecret(`firezone-${id}-db`, 32),
                DATABASE_PASSWORD: postgresPassword,
                OPENID_CONNECT_PROVIDERS: oidcProviders
            }
        });

        const claim = new PersistentVolumeClaim(this, 'encr-keys', {
            storage: Size.gibibytes(1),
            retain: true
        }).instance;

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 13000 }],
        });

        const statefulSet = new kplus.StatefulSet(this, 'app', { service });

        const container = statefulSet.addContainer({
            image: "firezone/firezone:0.7.28",
            ports: [
                { number: 13000, name: "http" },
                { number: props.port, name: "wireguard", protocol: kplus.Protocol.UDP }
            ],
            envFrom: [kplus.Env.fromSecret(secret), kplus.Env.fromConfigMap(configMap)],
            securityContext: {
                ensureNonRoot: false
            }
        });

        container.mount("/var/firezone", kplus.Volume.fromPersistentVolumeClaim(this, 'pvc', claim));

        ApiObject.of(statefulSet).addJsonPatch(JsonPatch.add("/spec/template/spec/containers/0/securityContext/capabilities", { add: ["NET_ADMIN", "SYS_MODULE"] }));

        new kplus.Service(this, 'wireguard', {
            type: kplus.ServiceType.NODE_PORT,
            ports: [{ port: props.port, nodePort: props.port, protocol: kplus.Protocol.UDP }],
            selector: statefulSet.toPodSelector()
        });

        new kplus.Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: kplus.IngressBackend.fromService(service)
            }]
        });
    }
}

const CONFIG = {
    VERSION: "latest",
    RESET_ADMIN_ON_BOOT: "true",
    LOCAL_AUTH_ENABLED: "false",

    WIREGUARD_IPV4_NETWORK: "100.64.0.0/10",
    WIREGUARD_IPV4_ADDRESS: "100.64.0.1",
    WIREGUARD_IPV6_NETWORK: "fd00::/106",
    WIREGUARD_IPV6_ADDRESS: "fd00::1",

    DATABASE_USER: "firezone",
    DATABASE_NAME: "firezone"
};