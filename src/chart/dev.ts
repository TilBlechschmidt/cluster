import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Infra } from './infra';
import { Namespace } from './namespace';

import secrets from '../../secrets.json';

import { Concourse } from '../lib/dev/concourse';
import { Plausible } from '../lib/dev/plausible';
import { BuildKitDaemon } from '../lib/dev/buildkitd';
import { Minio } from '../lib/dev/minio';
import { TelegramNotifier } from '../lib/dev/telegram-notifier';
import { Domain } from '../lib/infra/certManager';

export interface DevProps extends ChartProps {
    readonly infra: Infra;
}

export class Dev extends Chart {
    constructor(scope: Construct, id: string, props: DevProps) {
        super(scope, id, props);

        new Namespace(this, id);

        new Concourse(this, 'concourse', {
            oidc: props.infra.oidc,
            domain: props.infra.certManager.registerDomain('ci.tibl.dev'),
            group: 'admins'
        });

        new BuildKitDaemon(this, 'buildkit');

        new Plausible(this, 'plausible', {
            domain: props.infra.certManager.registerDomain('tracking.tibl.dev'),
        });

        new Minio(this, 'minio', {
            domain: props.infra.certManager.registerDomain('s3.tibl.dev'),
            adminDomain: props.infra.certManager.registerDomain('s3c.tibl.dev'),
            oidc: props.infra.oidc
        });

        new TelegramNotifier(this, 'telegram-notifier', {
            domain: new Domain('wryhta.fritz.box', '/telegram'),
            token: secrets.telegramBot.token,
            chatID: secrets.telegramBot.chatID,
            restrictToLocalNetwork: true
        });
    }
}
