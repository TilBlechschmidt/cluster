import { ConfigMap, Env, Ingress, IngressBackend, Protocol, Secret, Service, ServiceType, StatefulSet, Volume } from "cdk8s-plus-26";
import { Construct } from "constructs";
import { createHostPathVolume, obj2env } from "../../helpers";
import { attachMiddlewares, MiddlewareIdentifier } from "../../network";
import { Domain } from "./certManager";

const WILDCARD_CONFIG_NAME = '42-wildcards.conf'

export interface PiHoleProps {
    readonly domain: Domain;

    readonly auth: {
        /// Password for web interface, providing none will disable it
        readonly password?: string;
        /// Authentication middleware to put in front of the ingress
        readonly middleware?: MiddlewareIdentifier;
    }

    readonly upstreams: string[];
    readonly router?: {
        domain: string,
        ip: string,
        cidr: string,
    }

    /// Custom DNS wildcards for preventing NAT hairpinning on domains that point to a local server in their public record
    readonly wildcards?: { [key: string]: string };

    /// Domains which should explicitly use the upstreams as opposed to the wildcard settings
    /// (useful domains which use a wildcard but have subdomains that point outside the local net)
    readonly wildcardExclusions?: string[];
}

export class PiHole extends Construct {
    readonly ingress: Ingress;

    constructor(scope: Construct, id: string, props: PiHoleProps) {
        super(scope, id);

        const routerEnvVars: object = props.router ? {
            REV_SERVER: 'true',
            REV_SERVER_DOMAIN: props.router.domain,
            REV_SERVER_TARGET: props.router.ip,
            REV_SERVER_CIDR: props.router.cidr,
        } : {};

        const wildcards = Object.entries(props.wildcards ?? {}).map(([domain, ip]) => `address=/${domain}/${ip}`).join('\n');
        const wildcard_exclusions = (props.wildcardExclusions ?? []).map((domain) => props.upstreams.map(upstream => `server=/${domain}/${upstream}`).join('\n')).join('\n');
        const wildcardConfig = new ConfigMap(this, 'wildcards', {
            data: { [WILDCARD_CONFIG_NAME]: wildcards + '\n' + wildcard_exclusions }
        });

        const secret = new Secret(this, 'pass', {
            stringData: {
                WEBPASSWORD: props.auth.password ?? ''
            }
        });

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 80 }],
        });

        const statefulSet = new StatefulSet(this, 'app', { service });

        const container = statefulSet.addContainer({
            image: 'pihole/pihole:2024.03.2',
            ports: [
                { number: 53, hostPort: 53, protocol: Protocol.UDP },
                { number: 53, hostPort: 53, protocol: Protocol.TCP },
                { number: 80, name: "http" },
            ],
            envFrom: [Env.fromSecret(secret)],
            envVariables: obj2env({
                DNSMASQ_LISTENING: 'all',
                VIRTUAL_HOST: props.domain.fqdn,
                PIHOLE_DNS_: props.upstreams.join(';'),
                DNSSEC: 'true',
                ...routerEnvVars
            }),
            securityContext: {
                readOnlyRootFilesystem: false,
                ensureNonRoot: false,
                allowPrivilegeEscalation: true
            },
            resources: {},
        });

        container.mount('/etc/pihole', createHostPathVolume(this, 'data'));
        container.mount('/etc/dnsmasq.d', createHostPathVolume(this, 'dnsmasq'));
        container.mount(`/etc/dnsmasq.d/${WILDCARD_CONFIG_NAME}`, Volume.fromConfigMap(this, 'wildcard-conf', wildcardConfig), {
            subPath: WILDCARD_CONFIG_NAME
        });

        this.ingress = new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service)
            }]
        });

        if (props.auth.middleware) {
            attachMiddlewares(this.ingress, [props.auth.middleware]);
        }
    }
}
