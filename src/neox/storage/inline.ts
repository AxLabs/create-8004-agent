import { encodeMetadataDataUri } from "../metadata.js";
import type { MetadataStorage } from "./types.js";

export class InlineMetadataStorage implements MetadataStorage {
    readonly backend = "inline" as const;

    async publish(input: Parameters<MetadataStorage["publish"]>[0]) {
        return {
            uri: encodeMetadataDataUri(input.metadata),
            backend: this.backend,
        };
    }
}
