import { Construct } from 'constructs';
import { Chart, ChartProps } from 'cdk8s';
import * as kplus from 'cdk8s-plus-26';

export class Namespace extends Chart {
    name: string;

    constructor(scope: Construct, id: string, props: ChartProps = {}) {
        super(scope, id, props);

        new kplus.Namespace(this, id, {
            metadata: {
                name: id
            }
        });

        this.name = id;
    }
}