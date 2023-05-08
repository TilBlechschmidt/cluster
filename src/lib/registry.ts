import { Construct } from 'constructs';
import { EnvValue, Secret, Service, StatefulSet, Volume } from 'cdk8s-plus-26';
import { genSaltSync, hashSync } from 'bcrypt';

export interface RegistryProps {
    readonly user: string;
    readonly password: string;
}

export class Registry extends Construct {
    constructor(scope: Construct, id: string, props: RegistryProps) {
        super(scope, id);

        const salt = genSaltSync();
        const hash = hashSync(props.password, salt);

        const secret = new Secret(this, 'basicauth');
        secret.addStringData('htpasswd', hash);

        const service = new Service(this, id, {
            ports: [{
                port: 5000
            }]
        });

        const statefulSet = new StatefulSet(this, 'app', { service });

        const container = statefulSet.addContainer({
            image: 'registry:2',
            envVariables: {
                REGISTRY_AUTH: EnvValue.fromValue('htpasswd'),
                REGISTRY_AUTH_HTPASSWD_REALM: EnvValue.fromValue('RegistryRealm'),
                REGISTRY_AUTH_HTPASSWD_PATH: EnvValue.fromValue('/auth/htpasswd'),
            },
            portNumber: 5000,
        });

        container.mount('/auth', Volume.fromSecret(this, 'htpasswd', secret));
        container.mount('/var/lib/registry/docker', Volume.fromEmptyDir(this, 'images', 'data'));
    }
}
