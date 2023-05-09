import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Infra } from './infra';
import { Namespace } from './namespace';

import { Launch } from '../lib/app/launch';
import { Rallly } from '../lib/app/rallly';

import secrets from '../../secrets.json';

export interface AppsProps extends ChartProps {
    readonly infra: Infra;
}

export class Apps extends Chart {
    constructor(scope: Construct, id: string, props: AppsProps) {
        super(scope, id, props);

        new Namespace(this, id);
        
        new Launch(this, 'launch', {
            domains: [
                props.infra.certManager.registerDomain('blechschmidt.dev'),
                props.infra.certManager.registerDomain('blechschmidt.de'),
                props.infra.certManager.registerDomain('groundtrack.app'),
            ]
        });

        new Rallly(this, 'rallly', {
            domain: props.infra.certManager.registerDomain('time.blechschmidt.de'),

            allowedEmails: '*@blechschmidt.de$',
            authRequired: true,

            smtp: {
                noReply: 'noreply@blechschmidt.de',
                support: 'rallly.tca@blechschmidt.de',

                host: 'smtp.migadu.com',
                port: 465,
                user: 'noreply@blechschmidt.de',
                password: secrets.rallly.smtpPassword,

                secure: true,
                tls: true
            }
        });
    }
}