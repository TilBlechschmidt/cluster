import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Infra } from './infra';
import { Namespace } from './namespace';

import { Concourse } from '../lib/dev/concourse';
import { Plausible } from '../lib/dev/plausible';

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

        new Plausible(this, 'plausible', {
            domain: props.infra.certManager.registerDomain('tracking.blechschmidt.dev'),
        });
    }
}