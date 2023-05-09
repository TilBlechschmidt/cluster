import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Infra } from './infra';
import { Namespace } from './namespace';

import { Concourse } from '../lib/dev/concourse';

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
            user: 'tibl'
        });
    }
}