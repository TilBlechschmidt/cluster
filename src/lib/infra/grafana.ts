import { Ingress, IngressBackend, Secret, Service, ServiceType, StatefulSet, Volume } from "cdk8s-plus-26";
import { Construct } from "constructs";
import { createHostPathVolume } from "../../helpers";
import { Authelia } from "./authelia";
import { Domain } from "./certManager";

export interface GrafanaProps {
    readonly domain: Domain;
    readonly oidc: Authelia
}

export class Grafana extends Construct {
    readonly ingress: Ingress;

    constructor(scope: Construct, id: string, props: GrafanaProps) {
        super(scope, id);

        const oidcSecret = props.oidc.registerClient(id, {
            description: "Grafana monitoring",
            redirect_uris: [`https://${props.domain.fqdn}/login/generic_oauth`],
            userinfo_signing_algorithm: 'none',
            authorization_policy: 'one_factor'
        });

        const config = `
[server]
root_url = https://${props.domain.fqdn}

[explore]
enabled = true

[auth]
disable_login_form = true
oauth_auto_login = true

[auth.basic]
enabled = false

[auth.generic_oauth]
enabled = true
name = Authelia
icon = signin
client_id = ${id}
client_secret = ${oidcSecret}
scopes = openid profile email groups
empty_scopes = false
auth_url = https://${props.oidc.domain.fqdn}/api/oidc/authorization
token_url = https://${props.oidc.domain.fqdn}/api/oidc/token
api_url = https://${props.oidc.domain.fqdn}/api/oidc/userinfo
login_attribute_path = preferred_username
groups_attribute_path = groups
role_attribute_path = contains(groups[*], 'admin') && 'GrafanaAdmin' || 'Viewer'
name_attribute_path = name
use_pkce = true
allow_assign_grafana_admin = true
        `;

        const secret = new Secret(this, 'oidc', {
            stringData: {
                'grafana.ini': config
            }
        });

        const service = new Service(this, id, {
            type: ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 3000 }],
        });

        const statefulSet = new StatefulSet(this, 'app', { service });

        const container = statefulSet.addContainer({
            image: 'grafana/grafana:10.0.0',
            portNumber: 3000,
            // envFrom: [Env.fromSecret(secret)],
            securityContext: {
                group: 472,
                user: 472
            },
            resources: {},
        });

        container.mount('/var/lib/grafana', createHostPathVolume(this, 'data'));
        container.mount('/etc/grafana', Volume.fromSecret(this, 'config', secret));

        this.ingress = new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service)
            }]
        });
    }
}