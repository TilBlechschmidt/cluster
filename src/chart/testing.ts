import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Namespace } from './namespace';

import { Infra } from './infra';
import { GlAuth } from '../lib/infra/glauth';
import { Authelia } from '../lib/infra/authelia';

import secrets from '../../secrets.json';

export interface TestingProps extends ChartProps {
    readonly infra: Infra;
}

export class Testing extends Chart {
    constructor(scope: Construct, id: string, props: TestingProps) {
        super(scope, id, props);

        new Namespace(this, id);

        const glauth = new GlAuth(this, 'ldap', {
            host: 'tibl',
            tld: 'dev',

            users: GlAuth.usersFromSecret(secrets.ldap.users)
        });

        const oidc = new Authelia(this, 'authelia', {
            domain: props.infra.certManager.registerDomain('auth2.tibl.dev'),

            backend: glauth,

            secrets: {
                smtp: secrets.smtp,
                oidc: {
                    privateKey: secrets.authelia.oidc.privateKey
                }
            },

            config: {
                defaultRedirectUrl: "tibl.dev",
                domain: "tibl.dev",
                defaultPolicy: 'one_factor'
            }
        });

        const secret = oidc.registerClient('test', {
            description: 'This is an example client for debug purposes',
            redirect_uris: ['http://127.0.0.1:8080', 'http://127.0.0.1:8080/auth/callback'],
            authorization_policy: 'one_factor'
        });

        console.error('Test OIDC secret:', secret);
    }
}
