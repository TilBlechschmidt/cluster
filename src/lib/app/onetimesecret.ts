import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { Redis } from "../helpers/db/redis";
import { EnvValue } from "cdk8s-plus-26";

export interface OneTimeSecretProps {
    readonly domain: Domain;
}

export class OneTimeSecret extends WebApp {
    constructor(scope: Construct, id: string, props: OneTimeSecretProps) {
        super(scope, id, {
            domain: props.domain,
            image: 'onetimesecret/onetimesecret:v0.17.1',
            port: 3000,
            unsafeMode: true,
            env: {
                HOST: `${props.domain.fqdn}`,
                SSL: 'false',
                COLONEL: 'til@blechschmidt.de',
                RACK_ENV: 'production'
            }
        });

        const redis = new Redis(this, 'redis');
        this.container.env.addVariable("REDIS_URL", EnvValue.fromValue(`redis://${redis.serviceName}:6379/0`));
    }
}
