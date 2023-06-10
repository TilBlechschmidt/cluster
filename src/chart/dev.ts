import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Infra } from './infra';
import { Namespace } from './namespace';

import { Concourse } from '../lib/dev/concourse';
import { Plausible } from '../lib/dev/plausible';
import { BuildKitDaemon } from '../lib/dev/buildkitd';
import { TelegramNotifier } from '../lib/dev/telegram-notifier';
import { generateSecret } from '../helpers';

import secrets from '../../secrets.json';

export interface DevProps extends ChartProps {
    readonly infra: Infra;
}

export class Dev extends Chart {
    constructor(scope: Construct, id: string, props: DevProps) {
        super(scope, id, props);

        new Namespace(this, id);

        new Concourse(this, 'concourse', {
            oidc: props.infra.oidc,
            domain: props.infra.certManager.registerDomain('ci.blechschmidt.dev'),
            group: 'admins'
        });

        new BuildKitDaemon(this, 'buildkit');

        new Plausible(this, 'plausible', {
            domain: props.infra.certManager.registerDomain('tracking.blechschmidt.dev'),
        });

        new TelegramNotifier(this, 'tg-notify', {
            domain: props.infra.certManager.registerDomain('telegram.blechschmidt.dev'),
            token: secrets.telegramBotToken,
            secret: generateSecret('tg-notify', 32)
        });
    }
}