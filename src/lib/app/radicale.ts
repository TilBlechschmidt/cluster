import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume } from "../../helpers";
import { Secret, Volume } from "cdk8s-plus-26";
import { GlAuth } from "../infra/glauth";

export interface RadicaleProps {
    readonly domain: Domain;
    readonly ldap: GlAuth;
}

export class Radicale extends WebApp {
    constructor(scope: Construct, id: string, props: RadicaleProps) {
        super(scope, id, {
            domain: props.domain,
            image: 'themegatb/docker-radicale:just-a-test-ldap',
            port: 5232,
            unsafeMode: false
        });

        const config = new Secret(this, 'config', {
            stringData: {
                'config': this._buildConfig(props)
            }
        });

        this.container.mount('/data', createHostPathVolume(this, 'data'));
        this.container.mount('/config', Volume.fromSecret(this, 'cfg', config), { readOnly: true });

        // TODO For some reason auto-discovery does not work despite a working redirect ...
        //      (macOS does probe the correct URL and performs a login but then chokes)

        // const baseRule = {
        //     host: props.domain.root,
        //     backend: IngressBackend.fromService(this.service),
        //     pathType: HttpIngressPathType.EXACT
        // };

        // const autoDiscoverIngress = new Ingress(this, 'auto-discover', {
        //     rules: [
        //         { path: "/.well-known/caldav", ...baseRule },
        //         { path: "/.well-known/carddav", ...baseRule }
        //     ]
        // });

        // const redirectMiddleware = createMiddleware(this, 'auto-discover-redirect', {
        //     redirectRegex: {
        //         permanent: true,
        //         regex: 'https?://tibl.dev/.well-known/(caldav|carddav)',
        //         replacement: 'https://cal.tibl.dev/',
        //     }
        // });

        // attachMiddlewares(autoDiscoverIngress, [redirectMiddleware]);
    }

    _buildConfig(props: RadicaleProps) {
        return `
# -*- mode: conf -*-
# vim:ft=cfg

[server]
hosts = 0.0.0.0:5232

[logging]
level = warning

[auth]
type = ldap
ldap_uri = ldap://${props.ldap.serviceName}
ldap_base = ${props.ldap.baseDN}

ldap_reader_dn = cn=${props.ldap.serviceAccount.id},${props.ldap.baseDN}
ldap_secret = ${props.ldap.serviceAccountPassword}

ldap_filter = (memberOf=ou=radicale,ou=groups,dc=tibl,dc=dev)
ldap_load_groups = True

delay = 10

lc_username = True

[storage]
filesystem_folder = /data/collections
        `;
    }
}
