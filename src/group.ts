import { ChartProps } from "cdk8s";
import { Construct } from "constructs";
import { Namespace } from "./chart/namespace";

export interface GroupProps extends ChartProps {
    prefix?: string;
}

export class Group {
    props: GroupProps;

    constructor(scope: Construct, id: string, props: GroupProps = {}) {
        this.props = {
            ...props,
            namespace: props.namespace || id
        };

        new Namespace(scope, props.namespace || id);
    }

    genId(name: string) {
        return `${this.props.prefix || ''}${name}`;
    }
}