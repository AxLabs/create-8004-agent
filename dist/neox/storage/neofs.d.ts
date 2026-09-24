import type { AgentRegistrationMetadata, PublishedMetadata } from "../types.js";
import type { FetchLike, MetadataStorage, PublishMetadataInput } from "./types.js";
export interface NeofsStorageConfig {
    restGateway: string;
    containerId: string;
    publicGateway: string;
    bearerToken?: string;
}
export declare function validateNeofsStorageConfig(config: NeofsStorageConfig): NeofsStorageConfig;
export declare function neofsObjectPath(input: PublishMetadataInput): string;
export declare function neofsPublicUri(config: NeofsStorageConfig, containerId: string, objectId: string): string;
export declare function readHttpMetadata(uri: string, fetchImpl?: FetchLike): Promise<AgentRegistrationMetadata>;
export declare class NeofsMetadataStorage implements MetadataStorage {
    private readonly fetchImpl;
    readonly backend: "neofs";
    private readonly config;
    constructor(config: NeofsStorageConfig, fetchImpl?: FetchLike);
    publish(input: PublishMetadataInput): Promise<PublishedMetadata>;
}
