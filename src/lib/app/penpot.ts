import { Duration } from "cdk8s";
import { Ingress, IngressBackend, Service, StatefulSet, Volume, Probe } from "cdk8s-plus-26";
import { Construct } from "constructs";
import { createHostPathVolume, generateURLSafeSecret, obj2env } from "../../helpers";
import { Postgres } from "../helpers/db/postgres";
import { Redis } from "../helpers/db/redis";
import { Authelia } from "../infra/authelia";
import { Domain } from "../infra/certManager";

export interface PenpotProps {
    readonly domain: Domain;
    readonly oidc: Authelia;
}

export class Penpot extends Construct {
    constructor(scope: Construct, id: string, props: PenpotProps) {
        super(scope, id);

        const oidcClientSecret = props.oidc.registerClient(id, {
            description: "Penpot Design Tool",
            redirect_uris: [`https://${props.domain.fqdn}/api/auth/oauth/oidc/callback`],
            authorization_policy: 'one_factor'
        });

        const postgres = new Postgres(this, 'pg', {
            database: 'penpot',
            user: 'penpot',
            password: generateURLSafeSecret(`${id}-postgres`, 32)
        });

        const redis = new Redis(this, 'redis');
        const PENPOT_REDIS_URI = `redis://${redis.serviceName}/0`;

        const securityContext = {
            user: 1000,
            group: 3000,
            ensureNonRoot: true,
            readOnlyRootFilesystem: true
        };

        const service = new Service(this, id, {
            ports: [{ port: 80 }]
        });

        const penpot = new StatefulSet(this, 'app', {
            service,
            securityContext: {
                fsGroup: 3000,
                ensureNonRoot: false,
            }
        });

        const backend = penpot.addContainer({
            name: 'backend',
            image: 'penpotapp/backend:latest',
            portNumber: 6060,
            securityContext,
            // It is a slow boi
            startup: Probe.fromTcpSocket({
                port: 6060,
                initialDelaySeconds: Duration.seconds(15),
                periodSeconds: Duration.seconds(5),
                failureThreshold: 30,
            }),
            envVariables: obj2env({
                PENPOT_PUBLIC_URI: `https://${props.domain.fqdn}`,
                PENPOT_FLAGS: "disable-onboarding disable-registration disable-login-with-password disable-email-verification enable-login-with-oidc enable-prepl-server",
                // TODO Move to secret
                PENPOT_SECRET_KEY: generateURLSafeSecret(`${id}-backend-secret-key`, 32),

                // TODO Move to secret
                PENPOT_DATABASE_URI: `postgresql://${postgres.serviceName}/${postgres.database}`,
                PENPOT_DATABASE_USERNAME: postgres.user,
                PENPOT_DATABASE_PASSWORD: postgres.password,
                PENPOT_REDIS_URI,

                PENPOT_ASSETS_STORAGE_BACKEND: "assets-fs",
                PENPOT_STORAGE_ASSETS_FS_DIRECTORY: "/opt/data/assets",

                PENPOT_TELEMETRY_ENABLED: "true",

                // TODO Check if we can ignore the SMTP config

                PENPOT_OIDC_BASE_URI: `https://${props.oidc.domain.fqdn}/`,

                PENPOT_OIDC_CLIENT_ID: id,
                PENPOT_OIDC_CLIENT_SECRET: oidcClientSecret,

                PENPOT_OIDC_SCOPES: "openid email profile groups",

                PENPOT_OIDC_ROLES: "admin",
                PENPOT_OIDC_ROLES_ATTR: "groups",
                PENPOT_OIDC_NAME_ATTR: "name",
                PENPOT_OIDC_EMAIL_ATTR: "email",

            })
        });

        const frontend = penpot.addContainer({
            name: 'frontend',
            image: 'penpotapp/frontend:latest',
            portNumber: 80,
            securityContext: {
                // The entrypoint rewrites configs and stuff :/
                readOnlyRootFilesystem: false,
                ensureNonRoot: false,
            },
            envVariables: obj2env({
                PENPOT_FLAGS: "disable-onboarding disable-dashboard-templates-section disable-registration disable-login-with-password enable-login-with-oidc",
                PENPOT_BACKEND_URI: `http://127.0.0.1:6060`,
                PENPOT_EXPORTER_URI: `http://127.0.0.1:6061`,

                // No clue why they overwrite the default DNS resolvers ...
                PENPOT_INTERNAL_RESOLVER: 'kube-dns.kube-system.svc.cluster.local ipv6=off'
            }),
        });

        penpot.addContainer({
            name: 'exporter',
            image: 'penpotapp/exporter:latest',
            portNumber: 6061,
            securityContext: {
                // Fires up an entire browser which writes to all sorts of places :/
                readOnlyRootFilesystem: false,
                ensureNonRoot: false,
            },
            envVariables: obj2env({
                PENPOT_PUBLIC_URI: 'http://127.0.0.1',
                PENPOT_REDIS_URI
            })
        });

        const assets = createHostPathVolume(this, 'assets');

        frontend.mount("/opt/data/assets", assets);
        backend.mount("/opt/data/assets", assets);
        backend.mount("/tmp", Volume.fromEmptyDir(this, 'backend-tmp', 'backend-tmp'));

        new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service)
            }]
        });
    }
}
