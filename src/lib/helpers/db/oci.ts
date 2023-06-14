import { Construct } from 'constructs';
import { EnvValue, Secret, Service, StatefulSet, Volume } from 'cdk8s-plus-26';
import { genSaltSync, hashSync } from 'bcrypt';
import { Domain } from '../../infra/certManager';
import { ApiObject, JsonPatch } from 'cdk8s';

export interface RegistryProps {
    readonly user: string;
    readonly password: string;
}

export class ContainerRegistry extends Construct {
    service: Service;
    statefulSet: StatefulSet;

    _props: RegistryProps;

    constructor(scope: Construct, id: string, props: RegistryProps) {
        super(scope, id);

        this._props = props;

        const salt = genSaltSync();
        const hash = hashSync(props.password, salt);

        const secret = new Secret(this, 'basicauth');
        secret.addStringData('htpasswd', `${props.user}:${hash}`);

        this.service = new Service(this, id, {
            ports: [{
                port: 5000
            }]
        });

        this.statefulSet = new StatefulSet(this, 'app', {
            service: this.service,

        });

        const container = this.statefulSet.addContainer({
            image: 'registry:2',
            envVariables: {
                REGISTRY_AUTH: EnvValue.fromValue('htpasswd'),
                REGISTRY_AUTH_HTPASSWD_REALM: EnvValue.fromValue('RegistryRealm'),
                REGISTRY_AUTH_HTPASSWD_PATH: EnvValue.fromValue('/auth/htpasswd'),
            },
            portNumber: 5000,
            securityContext: {
                user: 1000,
                group: 3000,
            },
            resources: {}
        });

        container.mount('/auth', Volume.fromSecret(this, 'htpasswd', secret));
        container.mount('/var/lib/registry/docker', Volume.fromEmptyDir(this, 'images', 'data'));

        ApiObject.of(this.statefulSet).addJsonPatch(JsonPatch.add("/spec/template/spec/containers/0/securityContext/seccompProfile", { type: "RuntimeDefault" }));
        ApiObject.of(this.statefulSet).addJsonPatch(JsonPatch.add("/spec/template/spec/containers/0/securityContext/capabilities", { drop: ["ALL"] }));
    }

    generateDockerConfig(domain: Domain): string {
        const btoa = (string: string) => Buffer.from(string, 'binary').toString('base64');

        const dockerConfig = {
            auths: {
                [domain.fqdn]: {
                    username: this._props.user,
                    password: this._props.password,
                    auth: btoa(`${this._props.user}:${this._props.password}`)
                }
            }
        };

        return btoa(JSON.stringify(dockerConfig));
    }
}
