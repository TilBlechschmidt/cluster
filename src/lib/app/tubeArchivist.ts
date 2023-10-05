import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

import { Domain } from '../infra/certManager';
import { createHostPathVolume, generateSecret, obj2env } from '../../helpers';
import { Env, Ingress, IngressBackend, Secret, Volume } from 'cdk8s-plus-26';
import { Redis } from '../helpers/db/redis';
import { ElasticSearch } from '../helpers/db/elasticsearch';
import { GlAuth } from '../infra/glauth';

export interface TubeArchivistProps {
    readonly domain: Domain,

    readonly authentication: GlAuth | Credentials,

    readonly hostPath: string,
}

export interface Credentials {
    readonly user: string,
    readonly pass: string,
}

export class TubeArchivist extends Construct {
    readonly domain: Domain;
    readonly hostPath: string;

    constructor(scope: Construct, id: string, props: TubeArchivistProps) {
        super(scope, id);
        
        const elasticPassword = generateSecret(`${id}-es`, 32);

        const elasticSearch = new ElasticSearch(this, 'es', {
        	password: elasticPassword
        });

        const redis = new Redis(this, 'redis');
        
        const secret = new Secret(this, 'token');
        secret.addStringData('ELASTIC_PASSWORD', elasticPassword);

        if (props.authentication instanceof GlAuth) {
            const ldap = props.authentication;
            secret.addStringData('TA_LDAP', 'true');
            secret.addStringData('TA_LDAP_SERVER_URI', `ldap://${ldap.serviceName}`);
            secret.addStringData('TA_LDAP_BIND_DN', `cn=${ldap.serviceAccount.id},${ldap.baseDN}`);
            secret.addStringData('TA_LDAP_BIND_PASSWORD', ldap.serviceAccountPassword);
            secret.addStringData('TA_LDAP_USER_ATTR_MAP_USERNAME', 'uid');
            secret.addStringData('TA_LDAP_USER_ATTR_MAP_PERSONALNAME', 'givenName');
            secret.addStringData('TA_LDAP_USER_ATTR_MAP_SURNAME', 'sn');
            secret.addStringData('TA_LDAP_USER_ATTR_MAP_EMAIL', 'mail');
            secret.addStringData('TA_LDAP_USER_BASE', `ou=users,${ldap.baseDN}`);
            secret.addStringData('TA_LDAP_USER_FILTER', `(memberOf=ou=admin,ou=groups,${ldap.baseDN})`);

            // This needs to be set bc of bad coding :P
            secret.addStringData('TA_USERNAME', 'willnotbeusedanyway');
            secret.addStringData('TA_PASSWORD', generateSecret(`${id}-ta-willnotbeusedanyway`, 16));
        } else {
            secret.addStringData('TA_USERNAME', props.authentication.user);
            secret.addStringData('TA_PASSWORD', props.authentication.pass);
        }

        const service = new kplus.Service(this, id, {
            type: kplus.ServiceType.CLUSTER_IP,
            ports: [{ port: 80, targetPort: 8000 }],
        });

        const statefulset = new kplus.StatefulSet(this, 'app', {
            service
        });

        const container = statefulset.addContainer({
            image: 'bbilly1/tubearchivist:v0.4.1',
            ports: [{ number: 8000 }],
            envFrom: [Env.fromSecret(secret)],
            envVariables: obj2env({
                TA_HOST: props.domain.fqdn,

                HOST_UID: '1000',
                HOST_GID: '1000',

                TZ: 'Europe/Berlin',

                ES_URL: `http://${elasticSearch.serviceName}:9200`,
                REDIS_HOST: redis.serviceName
            }),
            securityContext: {
                ensureNonRoot: false,
                readOnlyRootFilesystem: false
            },
            resources: {}
        });

        // We do it in parts here so we can hand this to other apps
        container.mount('/cache', createHostPathVolume(this, 'cache'));
        container.mount('/youtube', Volume.fromHostPath(scope, 'hostPath-ta-media', 'media', {
            path: props.hostPath,
        }));

        new Ingress(this, props.domain.fqdn, {
            rules: [{
                host: props.domain.fqdn,
                backend: IngressBackend.fromService(service, { port: 80 })
            }]
        });

        this.hostPath = props.hostPath;
        this.domain = props.domain;
    }
}
