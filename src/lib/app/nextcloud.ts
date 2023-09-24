import { Helm, JsonPatch } from "cdk8s";
import { Construct } from "constructs";
import { buildHostPath, generateSecret, resolveNamespace } from "../../helpers";
import { Domain } from "../infra/certManager";

interface NextcloudProps {
    readonly domain: Domain,
    
    readonly smtp?: {
        readonly host: string,
        readonly port: number,

        readonly user: string,
        readonly pass: string,

        readonly domain: string,
        readonly sender: string
    }
}

export class Nextcloud extends Construct {
    constructor(scope: Construct, id: string, props: NextcloudProps) {
        super(scope, id);

        const configs: any = {
            'cdk8s-defaults.config.php': NC_DEFAULT_CONFIG,
        };

        const mail: any = {
            enabled: props.smtp !== undefined,
            fromAddress: props.smtp?.sender,
            domain: props.smtp?.domain,
            smtp: props.smtp ? {
                secure: 'ssl',
                host: props.smtp.host,
                port: props.smtp.port,
                name: props.smtp.user,
                password: props.smtp.pass
            } : {}
        };

        const nextcloud = new Helm(this, id, {
            releaseName: id,
            namespace: resolveNamespace(scope),
            chart: "nextcloud",
            version: "4.3.1",
            repo: "https://nextcloud.github.io/helm/",
            values: {
                ingress: {
                    enabled: true
                },
                cronjob: {
                    enabled: true
                },
                nextcloud: {
                    host: props.domain.fqdn,
                    username: 'admin',
                    password: generateSecret(`${id}-nc-initial-admin-pwd`, 32),

                    mail,
                    configs
                }
            }
        });

        const deployment = nextcloud.apiObjects.find(o => o.kind === 'Deployment');

        // Update the securityContext so we run as me!
        deployment?.addJsonPatch(JsonPatch.add('/spec/template/spec/securityContext/runAsUser', 1000));
        deployment?.addJsonPatch(JsonPatch.add('/spec/template/spec/securityContext/runAsGroup', 1000));

        // Patch the config dir from emptyDir to a hostPath one
        deployment?.addJsonPatch(JsonPatch.remove('/spec/template/spec/volumes/0/emptyDir'));
        deployment?.addJsonPatch(JsonPatch.add('/spec/template/spec/volumes/0/hostPath', {
            path: buildHostPath(this, 'data')
        }));
    }
}

const NC_DEFAULT_CONFIG = `<?php
$CONFIG = array (
'default_phone_region' => 'DE',
'knowledgebaseenabled' => false,
'skeletondirectory' => '',
'lost_password_link' => 'https://auth.tibl.dev',
'trashbin_retention_obligation' => 'auto, 30',
'upgrade.disable-web' => true,
'simpleSignUpLink.shown' => false,
'defaultapp' => 'files',
'hide_login_form' => false,
'overwriteprotocol' => 'https',
'trusted_proxies' => array(
0 => '127.0.0.1',
1 => '10.0.0.0/8'
)
);`;
