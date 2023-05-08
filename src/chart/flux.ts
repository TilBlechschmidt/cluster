import { Construct } from 'constructs';
import { Chart, ChartProps } from 'cdk8s';
import { Registry } from '../lib/registry';
import { generateSecret } from '../helpers';

export class Flux extends Chart {
    constructor(scope: Construct, id: string, props: ChartProps = {}) {
        super(scope, id, props);

        new Registry(this, 'registry', {
            user: 'flux',
            password: generateSecret(`flux-${id}-registry`, 64)
        });
    }
}