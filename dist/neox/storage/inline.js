import { encodeMetadataDataUri } from "../metadata.js";
export class InlineMetadataStorage {
    backend = "inline";
    async publish(input) {
        return {
            uri: encodeMetadataDataUri(input.metadata),
            backend: this.backend,
        };
    }
}
