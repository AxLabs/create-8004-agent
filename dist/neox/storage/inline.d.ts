import type { MetadataStorage } from "./types.js";
export declare class InlineMetadataStorage implements MetadataStorage {
    readonly backend: "inline";
    publish(input: Parameters<MetadataStorage["publish"]>[0]): Promise<{
        uri: string;
        backend: "inline";
    }>;
}
