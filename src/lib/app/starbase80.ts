import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { Domain } from "../infra/certManager";
import { ConfigMap, Volume } from "cdk8s-plus-26";

export interface Starbase80Props {
    readonly domain: Domain;
}

export class Starbase80 extends WebApp {
    constructor(scope: Construct, id: string, props: Starbase80Props) {
        super(scope, id, {
            domain: props.domain,
            image: 'jordanroher/starbase-80:1.6.1',
            port: 4173,
            unsafeMode: true,
            instantTermination: true,
            env: {
                TITLE: 'Wryhta',
                // LOGO: '',
                NEWWINDOW: 'false',
            }
        });

        const config = new ConfigMap(this, 'cfg', {
            data: { 'config.json': JSON.stringify(CONFIG) }
        });

        this.container.mount('/app/src/config', Volume.fromConfigMap(this, 'cfg-mount', config));
    }
}

const CONFIG = [
    {
        category: "Apps",
        iconBubblePadding: true,
        services: [
            {
                name: "Rallly",
                uri: "https://time.blechschmidt.de",
                description: "Doodle in cool",
                icon: "selfhst-rallly",
                iconBubble: false
            },
            {
                name: "bin.",
                uri: "https://bin.tibl.dev",
                description: "Pastebin",
                icon: "pastebin",
                iconBubble: false
            },
            {
                name: "Excalidraw",
                uri: "https://draw.tibl.dev",
                description: "Whiteboard",
                icon: "selfhst-excalidraw",
                iconBubble: false
            },
            {
                name: "lnk.",
                uri: "https://l.tibl.dev",
                description: "Link shortener",
                icon: "selfhst-shlink",
                iconBubble: false
            },
            {
                name: "Audiobookshelf",
                uri: "https://audiobook.tibl.dev",
                description: "Audiobook library",
                icon: "selfhst-audiobookshelf",
                iconBubble: false
            },
            {
                name: "Jellyfin",
                uri: "https://media.tibl.dev",
                description: "Media server",
                icon: "selfhst-jellyfin",
                iconBubble: false
            },
            {
                name: "TubeArchivist",
                uri: "https://ta.tibl.dev",
                description: "YouTube archival",
                icon: "selfhst-tube-archivist",
                iconBubble: false
            },
            {
                name: "SeaFile",
                uri: "https://sf.tibl.dev",
                description: "Personal cloud",
                icon: "selfhst-seafile",
                iconBubble: false
            },
            {
                name: "HedgeDoc",
                uri: "https://doc.tibl.dev",
                description: "Markdown editor",
                icon: "selfhst-hedgedoc",
                iconBubble: false
            },
            {
                name: "HomeAssistant",
                uri: "https://home.tibl.dev",
                description: "Smart home",
                icon: "selfhst-home-assistant",
                iconBubble: false
            },
            {
                name: "Paperless",
                uri: "https://paper.tibl.dev",
                description: "Document archival",
                icon: "selfhst-paperless-ngx",
                iconBubble: false
            },
            {
                name: "Radicale",
                uri: "https://cal.tibl.dev",
                description: "Calendar & contacts",
                icon: "selfhst-radicale",
                iconBubble: false
            },
            {
                name: "MiniFlux",
                uri: "https://reader.tibl.dev",
                description: "RSS aggregator",
                icon: "miniflux-light",
                iconAspect: "width",
                iconBubble: false
            },
            {
                name: "Spliit",
                uri: "https://split.tibl.dev",
                description: "Splitwise in cool",
                // icon: "selfhst-home-assistant",
                iconBubble: false
            },
            {
                name: "jrnl.",
                uri: "https://jrnl.tibl.dev",
                description: "Journals",
                // icon: "selfhst-tube-archivist",
                iconBubble: false
            },
        ]
    },
    {
        category: "Infra",
        iconBubblePadding: true,
        services: [
            {
                name: "Authelia",
                uri: "https://auth.tibl.dev",
                description: "Authentication",
                icon: "selfhst-authelia",
                iconBubble: false
            },
            {
                name: "Firezone",
                uri: "https://vpn.tibl.dev",
                description: "Wireguard VPN",
                icon: "selfhst-wireguard",
                iconBubble: false
            },
            {
                name: "LibreSpeed",
                uri: "https://speed.tibl.dev",
                description: "Local speed test",
                icon: "selfhst-librespeed",
                iconBubble: false
            },
            {
                name: "PiHole",
                uri: "https://dns.tibl.dev",
                description: "Ad-blocking DNS",
                icon: "pi-hole",
                iconAspect: "height",
                iconBubble: false
            }
        ]
    },
    {
        category: "Dev",
        iconBubblePadding: true,
        services: [
            {
                name: "Concourse",
                uri: "https://ci.tibl.dev",
                description: "CI pipelines",
                icon: "concourse",
                iconBubble: false
            },
        ]
    },
];