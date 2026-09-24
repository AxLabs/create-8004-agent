import type { AgentProjectConfig } from "../types.js";
import { InlineMetadataStorage } from "./inline.js";
import { NeofsMetadataStorage, neofsPublicUri, validateNeofsStorageConfig } from "./neofs.js";
import type { FetchLike, MetadataStorage } from "./types.js";

export * from "./types.js";
export * from "./inline.js";
export * from "./neofs.js";

export function metadataBackend(config: AgentProjectConfig): "inline" | "neofs" {
    const backend = config.metadataStorage || "inline";
    if (backend !== "inline" && backend !== "neofs") {
        throw new Error(`Unsupported metadataStorage "${backend}". Use inline or neofs.`);
    }
    return backend;
}

export function createMetadataStorage(
    config: AgentProjectConfig,
    fetchImpl: FetchLike = fetch
): MetadataStorage {
    if (metadataBackend(config) === "inline") return new InlineMetadataStorage();
    return new NeofsMetadataStorage(
        {
            restGateway: process.env.NEOFS_REST_GATEWAY ?? "",
            containerId: process.env.NEOFS_CONTAINER_ID ?? "",
            publicGateway: process.env.NEOFS_PUBLIC_GATEWAY ?? "",
            bearerToken: process.env.NEOFS_BEARER_TOKEN,
        },
        fetchImpl
    );
}

export function uriForStoragePreflight(config: AgentProjectConfig): string | undefined {
    if (metadataBackend(config) === "inline") return undefined;
    const storageConfig = validateNeofsStorageConfig({
        restGateway: process.env.NEOFS_REST_GATEWAY ?? "",
        containerId: process.env.NEOFS_CONTAINER_ID ?? "",
        publicGateway: process.env.NEOFS_PUBLIC_GATEWAY ?? "",
        bearerToken: process.env.NEOFS_BEARER_TOKEN,
    });
    return neofsPublicUri(storageConfig, storageConfig.containerId, "1".repeat(44));
}
