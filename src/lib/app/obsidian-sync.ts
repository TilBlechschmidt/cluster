import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume, generateURLSafeSecret } from "../../helpers";
import { ConfigMap, Env, Secret, Volume } from "cdk8s-plus-26";

export interface ObsidianSyncProps {
    readonly domain: Domain;
}

export class ObsidianSync extends WebApp {
    constructor(scope: Construct, id: string, props: ObsidianSyncProps) {
        super(scope, id, {
            domain: props.domain,
            image: 'couchdb:3.4.2',
            port: 5984,
            unsafeMode: true,
        });

        const config = new ConfigMap(this, 'cfg', {
            data: { 'config.ini': DEFAULT_CONFIG }
        });

        const configVolume = Volume.fromEmptyDir(this, 'etc', 'etc');

        // We need to use an init container to copy the config into an emptyDir
        // because the entrypoint of the main container tries to chmod it. This
        // obviously will not work with a read-only file ... astonishing that
        // this is their official workaround too instead of just fixing their
        // entrypoint. But oh well ...
        const init = this.statefulSet.addInitContainer({
            image: "busybox:1.36.1",
            command: [
                "sh", "-c",
                "cp /config/config.ini /opt/couchdb/etc/local.d/"
            ],
            resources: {},
            securityContext: {
                ensureNonRoot: false
            }
        });

        init.mount('/opt/couchdb/etc/local.d', configVolume);
        init.mount('/config', Volume.fromConfigMap(this, 'cfg-input', config));

        const credentials = new Secret(this, 'credentials', {
            stringData: {
                COUCHDB_USER: 'tibl',
                COUCHDB_PASSWORD: generateURLSafeSecret(`ols-${id}-couch-pwd`, 32),
            }
        });

        this.container.env.copyFrom(Env.fromSecret(credentials));

        this.container.mount('/opt/couchdb/etc/local.d', configVolume);
        this.container.mount('/opt/couchdb/data', createHostPathVolume(this, 'data'));
    }
}

const DEFAULT_CONFIG = `[couchdb]
single_node = true
max_document_size = 50000000

[chttpd]
require_valid_user = true
max_http_request_size = 4294967296

[chttpd_auth]
require_valid_user = true
authentication_redirect = /_utils/session.html

[httpd]
bind_address = 0.0.0.0
WWW-Authenticate = Basic realm="couchdb"
enable_cors = true

[cors]
origins = app://obsidian.md,capacitor://localhost,http://localhost
credentials = true
headers = accept, authorization, content-type, origin, referer
methods = GET,PUT,POST,HEAD,DELETE
max_age = 3600
`;
