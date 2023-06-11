import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Infra } from './infra';
import { Namespace } from './namespace';

import { Launch } from '../lib/app/launch';
import { Rallly } from '../lib/app/rallly';

import secrets from '../../secrets.json';
import { WebApp } from '../lib/helpers/webApp';
import { Excalidraw } from '../lib/app/excalidraw';

export interface AppsProps extends ChartProps {
    readonly infra: Infra;
}

export class Apps extends Chart {
    constructor(scope: Construct, id: string, props: AppsProps) {
        super(scope, id, props);

        const registerDomain = (fqdn: string) => props.infra.certManager.registerDomain(fqdn);

        new Namespace(this, id);

        new Launch(this, 'launch', {
            domains: [
                registerDomain('blechschmidt.dev'),
                registerDomain('blechschmidt.de'),
                registerDomain('groundtrack.app'),
                registerDomain('tibl.dev'),
            ]
        });

        new Rallly(this, 'rallly', {
            domain: registerDomain('time.blechschmidt.de'),

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

        new WebApp(this, 'bin', {
            domain: registerDomain('bin.tibl.dev'),
            image: 'ghcr.io/w4/bin:master',
            args: ["--buffer-size", "100", "--max-paste-size", "1048576"],
            port: 8000
        });

        new Excalidraw(this, 'excalidraw', {
            domain: registerDomain('draw.tibl.dev')
        });
    }
}