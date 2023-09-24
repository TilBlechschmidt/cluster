import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Namespace } from './namespace';

import { Infra } from './infra';
// import { Authelia } from '../lib/infra/authelia';

// import secrets from '../../secrets.json';

export interface TestingProps extends ChartProps {
    readonly infra: Infra;
}

export class Testing extends Chart {
    constructor(scope: Construct, id: string, props: TestingProps) {
        super(scope, id, props);

        new Namespace(this, id);

        // const oidc = new Authelia(this, 'authelia', {
        //     domain: props.infra.certManager.registerDomain('auth2.tibl.dev'),

        //     users: secrets.authelia.users,

        //     secrets: {
        //         smtp: secrets.smtp,
        //         oidc: {
        //             privateKey: secrets.authelia.oidc.privateKey
        //         }
        //     },

        //     config: {
        //         defaultRedirectUrl: "tibl.dev",
        //         domain: "tibl.dev",
        //         defaultPolicy: 'one_factor'
        //     }
        // });

        // const secret = oidc.registerClient('test', {
        //     description: 'This is an example client for debug purposes',
        //     redirect_uris: ['http://127.0.0.1:8080'],
        //     authorization_policy: 'one_factor'
        // });

        // console.error('Test OIDC secret:', secret);
    }
}