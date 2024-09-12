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
import { MagicPack } from '../lib/app/magicpack';
import { Jrnl } from '../lib/app/jrnl';
import { HedgeDoc } from '../lib/app/hedgedoc';
import { SeaFile } from '../lib/app/seafile';
import { AudioBookShelf } from '../lib/app/audiobookshelf';
import { Memos } from '../lib/app/memos';
import { attachMiddlewares, restrictToLocalNetwork } from '../network';
import { Penpot } from '../lib/app/penpot';
import { OneTimeSecret } from '../lib/app/onetimesecret';

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

        new WebApp(this, 'gpcache', {
            domain: registerDomain('gp.tibl.dev'),
            image: 'ghcr.io/tilblechschmidt/gpcache:sha-8708578',
            port: 3000,
            env: secrets.gpcache,
        });

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

        const scanTB = new ScanServer(this, 'scanservtb', {
            domain: registerDomain('scan-tibl.tibl.dev'),
            webdav: secrets.webdav.tibl
        });

        const scanUB = new ScanServer(this, 'scanservub', {
            domain: registerDomain('scan-ub.tibl.dev'),
            webdav: secrets.webdav.ub
        });

        new Atuin(this, 'atuin', {
            domain: registerDomain('shell.tibl.dev'),
            openRegistration: false
        });

        const magicPack = new MagicPack(this, 'magicpack', {
            domain: registerDomain('wake.tibl.dev'),
            computers: {
                SuprimPC: {
                    name: "Suprim PC",
                    computer: {
                        location: "Bedroom",
                        name: "DESKTOP-OHMSG0R",
                        dns: "DESKTOP-OHMSG0R.fritz.box",
                        mac: "A8:A1:59:51:3D:0A",
                    }
                }
            }
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

        const memos = new Memos(this, 'memos', {
            domain: registerDomain('memos.tibl.dev'),
            oidc: props.infra.oidc
        });

        new Penpot(this, 'penpot', {
            domain: props.infra.certManager.registerDomain('penpot.tibl.dev'),
            oidc: props.infra.oidc
        });

        new OneTimeSecret(this, 'ots', {
            domain: props.infra.certManager.registerDomain('onetimesecret.tibl.dev')
        });

        for (const app of [audioBookShelf, tubeArchivist, magicPack, jrnl, memos, scanTB, scanUB]) {
            attachMiddlewares(app.ingress, [restrictToLocalNetwork(app)]);
        }
    }
}
