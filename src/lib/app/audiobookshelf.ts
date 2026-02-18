import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { createHostPathVolume } from "../../helpers";
import { Authelia } from "../infra/authelia";
import { Secret, Volume } from "cdk8s-plus-26";

export interface AudioBookShelfProps {
    readonly domain: Domain;
    readonly oidc: Authelia;
    media: { [name: string]: string },
}

export class AudioBookShelf extends WebApp {
    constructor(scope: Construct, id: string, props: AudioBookShelfProps) {
        const clientSecret = props.oidc.registerClient(id, {
            description: 'audiobookshelf',
            redirect_uris: [
                `https://${props.domain.fqdn}/auth/openid/callback`,
                'audiobookshelf://oauth',
                'stillapp://oauth'
            ]
        });

        super(scope, id, {
            domain: props.domain,
            image: 'ghcr.io/advplyr/audiobookshelf:2.7.1',
            port: 80
        });

        this.container.mount('/config', createHostPathVolume(this, 'config'));
        this.container.mount('/metadata', createHostPathVolume(this, 'metadata'));

        for (let key in props.media) {
            const path = props.media[key];
            this.container.mount(`/media/${key}`, Volume.fromHostPath(this, `media-${key}`, `media-${key}`, { path }));
        }

        new Secret(this, 'oidc', {
            stringData: {
                clientID: id,
                clientSecret
            }
        });
    }
}
