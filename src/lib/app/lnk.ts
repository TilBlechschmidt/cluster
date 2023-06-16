import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume, generateSecret } from "../../helpers";

export interface LnkProps {
    domain: Domain;
}

export class Lnk extends WebApp {
    constructor(scope: Construct, id: string, props: LnkProps) {
        const token = generateSecret(`${id}-token`, 32);

        super(scope, id, {
            domain: props.domain,
            image: 'ghcr.io/tilblechschmidt/lnk:sha-e46d402',
            port: 3000,
            env: {
                DOMAIN: props.domain.fqdn,
                // TODO This should probably be a secret ...
                TOKEN: token,
            }
        });

        this.container.mount('/var/lib/lnk', createHostPathVolume(this, 'data'));
    }
}
