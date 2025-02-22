import { Construct } from "constructs";
import { WebApp } from "../helpers/webApp";
import { createHostPathVolume } from "../../helpers";

export class Ollama extends WebApp {
    constructor(scope: Construct, id: string) {
        super(scope, id, {
            image: 'ollama/ollama:latest',
            port: 11434,
            unsafeMode: true,
            env: {
            }
        });

        this.container.mount('/root/.ollama', createHostPathVolume(this, 'models'));
    }
}
