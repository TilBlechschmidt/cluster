import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-26';

export interface ServiceAccountProps {
    /**
    * Verbs to allow. (e.g ['get', 'watch'])
    */
    readonly verbs: string[];
    /**
     * Resources this rule applies to.
     */
    readonly resources: kplus.IApiResource[];
}

export class ServiceAccount extends Construct {
    instance: kplus.IServiceAccount;

    constructor(scope: Construct, id: string, props: ServiceAccountProps) {
        super(scope, id);

        const serviceAccount = new kplus.ServiceAccount(scope, 'account');

        const role = new kplus.Role(scope, 'role');
        role.allow(props.verbs, ...props.resources);

        const binding = new kplus.RoleBinding(scope, 'binding', {
            role
        });

        binding.addSubjects(serviceAccount);

        this.instance = serviceAccount;
    }
}
