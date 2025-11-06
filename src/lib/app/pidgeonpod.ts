import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume } from "../../helpers";
// import { Authelia } from "../infra/authelia";

export interface PidgeonPodProps {
    readonly domain: Domain;
    // readonly oidc: Authelia;
    // /// Group that has access
    // readonly group: string;
}

export class PidgeonPod extends WebApp {
    constructor(scope: Construct, id: string, props: PidgeonPodProps) {
        // const redirectURI = `https://${props.domain.fqdn}/auth/callback`;
        // const clientSecret = props.oidc.registerClient(id, {
        //     description: 'PidgeonPod',
        //     redirect_uris: [redirectURI]
        // });

        super(scope, id, {
            domain: props.domain,
            image: 'ghcr.io/aizhimou/pigeon-pod:release-1.15.0',
            port: 8080,
            env: {
                PIGEON_BASE_URL: `https://${props.domain.fqdn}`,
                PIGEON_AUDIO_FILE_PATH: `/data/audio/`,
                PIGEON_COVER_FILE_PATH: `/data/cover/`,
                SPRING_DATASOURCE_URL: `jdbc:sqlite:/data/pigeon-pod.db`,
            }
        });

        this.container.mount('/data', createHostPathVolume(this, 'data'));
    }
}
