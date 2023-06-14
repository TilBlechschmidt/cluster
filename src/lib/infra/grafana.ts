import { Env, Ingress, IngressBackend, Secret, Service, ServiceType, StatefulSet } from "cdk8s-plus-26";
import { Construct } from "constructs";
import { createHostPathVolume } from "../../helpers";
import { Authelia } from "./authelia";
import { Domain } from "./certManager";

export interface GrafanaProps {
    readonly domain: Domain;
    readonly oidc: Authelia
}

export class Grafana extends Construct {
    constructor(scope: Construct, id: string, props: GrafanaProps) {
        super(scope, id);

        const oidcSecret = props.oidc.registerClient(id, {
            description: "Grafana monitoring",
            redirect_uris: [`https://${props.domain.fqdn}/login/generic_oauth`],
            userinfo_signing_algorithm: 'none'
        });

        const secret = new Secret(this, 'oidc', {
            stringData: {
                GF_SERVER_ROOT_URL: `https://${props.domain.fqdn}`,
                GF_AUTH_GENERIC_OAUTH_ENABLED: 'true',
                GF_AUTH_GENERIC_OAUTH_NAME: 'Authelia',
                GF_AUTH_GENERIC_OAUTH_CLIENT_ID: id,
                GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET: oidcSecret,
                GF_AUTH_GENERIC_OAUTH_SCOPES: 'openid profile email groups',
                GF_AUTH_GENERIC_OAUTH_EMPTY_SCOPES: 'false',
                GF_AUTH_GENERIC_OAUTH_AUTH_URL: `https://${props.oidc.domain.fqdn}/api/oidc/authorization`,
                GF_AUTH_GENERIC_OAUTH_TOKEN_URL: `https://${props.oidc.domain.fqdn}/api/oidc/token`,
                GF_AUTH_GENERIC_OAUTH_API_URL: `https://${props.oidc.domain.fqdn}/api/oidc/userinfo`,
                GF_AUTH_GENERIC_OAUTH_LOGIN_ATTRIBUTE_PATH: 'preferred_username',
                GF_AUTH_GENERIC_OAUTH_GROUPS_ATTRIBUTE_PATH: 'groups',
                GF_AUTH_GENERIC_OAUTH_NAME_ATTRIBUTE_PATH: 'name',
                GF_AUTH_GENERIC_OAUTH_USE_PKCE: 'true'
            }
        });

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 3000 }],
        });

        const statefulSet = new StatefulSet(this, 'app', { service });

        const container = statefulSet.addContainer({
            image: 'grafana/grafana:9.1.0',
            portNumber: 3000,
            envFrom: [Env.fromSecret(secret)],
            securityContext: {
                group: 472
            },
            resources: {},
        });

        container.mount('/var/lib/grafana', createHostPathVolume(this, 'data'));

        new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service)
            }]
        });
    }
}