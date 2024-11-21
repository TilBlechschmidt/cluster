import { Chart, ChartProps } from 'cdk8s';
import { Construct } from 'constructs';

import { Infra } from './infra';
import { Namespace } from './namespace';

import { Launch } from '../lib/app/launch';
import { Rallly } from '../lib/app/rallly';

import secrets from '../../secrets.json';
import { WebApp } from '../lib/helpers/webApp';
import { Excalidraw } from '../lib/app/excalidraw';
import { Lnk } from '../lib/app/lnk';
import { Jellyfin } from '../lib/app/jellyfin';
import { ScanServer } from '../lib/app/scanServer';
import { Atuin } from '../lib/app/atuin';
import { TubeArchivist } from '../lib/app/tubeArchivist';
import { Jrnl } from '../lib/app/jrnl';
import { HedgeDoc } from '../lib/app/hedgedoc';
import { SeaFile } from '../lib/app/seafile';
import { AudioBookShelf } from '../lib/app/audiobookshelf';
import { attachMiddlewares, restrictToLocalNetwork } from '../network';
import { HomeAssistant } from '../lib/app/hass';
import { Paperless } from '../lib/app/paperless';
import { Radicale } from '../lib/app/radicale';

export interface AppsProps extends ChartProps {
    readonly infra: Infra;
}

export class Apps extends Chart {
    constructor(scope: Construct, id: string, props: AppsProps) {
        super(scope, id, props);

        const registerDomain = (fqdn: string) => props.infra.certManager.registerDomain(fqdn);

        new Namespace(this, id);

        new Launch(this, 'launch', {
            domains: [
                registerDomain('blechschmidt.de'),
                registerDomain('tibl.dev'),
            ]
        });

        new Rallly(this, 'rallly', {
            domain: registerDomain('time.blechschmidt.de'),

            allowedEmails: '*@blechschmidt.de$',
            authRequired: true,

            smtp: secrets.smtp,
        });

        new WebApp(this, 'bin', {
            domain: registerDomain('bin.tibl.dev'),
            image: 'ghcr.io/w4/bin:master',
            args: ["--buffer-size", "100", "--max-paste-size", "1048576"],
            port: 8000
        });

        new Excalidraw(this, 'excalidraw', {
            domain: registerDomain('draw.tibl.dev')
        });

        new Lnk(this, 'lnk', {
            domain: registerDomain('l.tibl.dev')
        });

        // Disabled as it is somehow broken and spams the upstream API ...
        // new WebApp(this, 'gpcache', {
        //     domain: registerDomain('gp.tibl.dev'),
        //     image: 'ghcr.io/tilblechschmidt/gpcache:sha-8708578',
        //     port: 3000,
        //     env: secrets.gpcache,
        // });

        const audioBookShelf = new AudioBookShelf(this, 'audiobookshelf', {
            domain: registerDomain('audiobook.tibl.dev'),
            oidc: props.infra.oidc,
            media: {
                books: '/mnt/raid/Media/Audiobooks',
            }
        });

        new Jellyfin(this, 'jellyfin', {
            domain: registerDomain('media.tibl.dev'),
            media: {
                movies: '/mnt/raid/Media/Movies',
                shows: '/mnt/raid/Media/Shows',
                books: '/mnt/raid/Media/Books',
                music: '/mnt/raid/Media/Music',
                production: '/mnt/raid/Media/Video Production'
            },
            readOnlyMedia: {
                youtube: '/mnt/raid/Media/YouTube'
            }
        });

        const tubeArchivist = new TubeArchivist(this, 'tubearchivist', {
            domain: registerDomain('ta.tibl.dev'),
            authentication: props.infra.ldap,
            hostPath: '/mnt/raid/Media/YouTube'
        });

        const scanServer = new ScanServer(this, 'scan', {
            domain: registerDomain('scan.tibl.dev'),
            users: secrets.scanServer
        });

        new Atuin(this, 'atuin', {
            domain: registerDomain('shell.tibl.dev'),
            openRegistration: false
        });

        const jrnl = new Jrnl(this, 'jrnl', {
            domain: registerDomain('jrnl.tibl.dev'),
            oidc: props.infra.oidc,
            group: 'journal'
        });

        new SeaFile(this, 'seafile', {
            domain: registerDomain('sf.tibl.dev'),
            oidc: props.infra.oidc
        });

        new HedgeDoc(this, 'hedgedoc', {
            domain: registerDomain('doc.tibl.dev'),
            oidc: props.infra.oidc
        });

        const hass = new HomeAssistant(this, 'hass', {
            domain: props.infra.certManager.registerDomain('home.tibl.dev'),
        });

        const paperless = new Paperless(this, 'paperless', {
            domain: props.infra.certManager.registerDomain('paper.tibl.dev'),
            oidc: props.infra.oidc
        });

        const radicale = new Radicale(this, 'radicale', {
            domain: props.infra.certManager.registerDomain('cal.tibl.dev'),
            ldap: props.infra.ldap
        });

        for (const app of [audioBookShelf, tubeArchivist, jrnl, scanServer, hass, paperless, radicale]) {
            attachMiddlewares(app.ingress, [restrictToLocalNetwork(app)]);
        }
    }
}
