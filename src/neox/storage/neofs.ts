import type { AgentRegistrationMetadata, PublishedMetadata } from "../types.js";
import { metadataEquals } from "../metadata.js";
import type { FetchLike, MetadataStorage, PublishMetadataInput } from "./types.js";

export interface NeofsStorageConfig {
    restGateway: string;
    containerId: string;
    publicGateway: string;
    bearerToken?: string;
}

interface NeofsUploadResponse {
    container_id?: unknown;
    object_id?: unknown;
}

function requiredUrl(value: string, name: string): string {
    const trimmed = value.trim().replace(/\/$/, "");
    if (!trimmed) throw new Error(`${name} is required when METADATA_STORAGE=neofs`);
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        throw new Error(`${name} must be a valid HTTP(S) URL`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`${name} must be an HTTP(S) URL`);
    }
    return trimmed;
}

export function validateNeofsStorageConfig(config: NeofsStorageConfig): NeofsStorageConfig {
    const restGateway = requiredUrl(config.restGateway, "NEOFS_REST_GATEWAY");
    const publicGateway = requiredUrl(config.publicGateway, "NEOFS_PUBLIC_GATEWAY");
    if (!publicGateway.startsWith("https://")) {
        throw new Error("NEOFS_PUBLIC_GATEWAY must be an HTTPS URL");
    }
    const containerId = config.containerId.trim();
    if (!containerId) {
        throw new Error("NEOFS_CONTAINER_ID is required when METADATA_STORAGE=neofs");
    }
    return { ...config, restGateway, publicGateway, containerId };
}

export function neofsObjectPath(input: PublishMetadataInput): string {
    return `erc-8004/${input.chainId}/${input.registry.toLowerCase()}/${input.agentId.toString(10)}/registration.json`;
}

export function neofsPublicUri(config: NeofsStorageConfig, containerId: string, objectId: string): string {
    return `${config.publicGateway}/v1/objects/${encodeURIComponent(containerId)}/by_id/${encodeURIComponent(objectId)}`;
}

export async function readHttpMetadata(
    uri: string,
    fetchImpl: FetchLike = fetch
): Promise<AgentRegistrationMetadata> {
    let response: Response;
    try {
        response = await fetchImpl(uri, { headers: { accept: "application/json" } });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Metadata read-back failed for ${uri}: ${message}`);
    }
    if (!response.ok) {
        throw new Error(`Metadata read-back failed for ${uri}: HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json") && !contentType.includes("+json")) {
        throw new Error(`Metadata read-back from ${uri} returned non-JSON Content-Type ${contentType || "(missing)"}`);
    }
    try {
        return JSON.parse(await response.text()) as AgentRegistrationMetadata;
    } catch {
        throw new Error(`Metadata read-back from ${uri} returned malformed JSON`);
    }
}

export class NeofsMetadataStorage implements MetadataStorage {
    readonly backend = "neofs" as const;
    private readonly config: NeofsStorageConfig;

    constructor(config: NeofsStorageConfig, private readonly fetchImpl: FetchLike = fetch) {
        this.config = validateNeofsStorageConfig(config);
    }

    async publish(input: PublishMetadataInput): Promise<PublishedMetadata> {
        const objectPath = neofsObjectPath(input);
        const uploadUrl = `${this.config.restGateway}/v1/objects/${encodeURIComponent(this.config.containerId)}`;
        const headers: Record<string, string> = {
            "content-type": "application/json",
            "x-attributes": JSON.stringify({
                FileName: "registration.json",
                FilePath: objectPath,
                "Content-Type": "application/json",
            }),
        };
        if (this.config.bearerToken) {
            headers.authorization = `Bearer ${this.config.bearerToken}`;
        }

        let response: Response;
        try {
            response = await this.fetchImpl(uploadUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(input.metadata),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`NeoFS upload failed at ${uploadUrl}: ${message}`);
        }
        if (!response.ok) {
            throw new Error(`NeoFS upload failed at ${uploadUrl}: HTTP ${response.status}`);
        }

        let parsed: NeofsUploadResponse;
        try {
            parsed = JSON.parse(await response.text()) as NeofsUploadResponse;
        } catch {
            throw new Error("NeoFS upload returned malformed JSON");
        }
        if (typeof parsed.container_id !== "string" || !parsed.container_id) {
            throw new Error("NeoFS upload response is missing container_id");
        }
        if (typeof parsed.object_id !== "string" || !parsed.object_id) {
            throw new Error("NeoFS upload response is missing object_id");
        }

        const uri = neofsPublicUri(this.config, parsed.container_id, parsed.object_id);
        const readBack = await readHttpMetadata(uri, this.fetchImpl);
        if (!metadataEquals(readBack, input.metadata)) {
            throw new Error("NeoFS public read-back metadata does not match the uploaded registration file");
        }

        return {
            uri,
            backend: this.backend,
            containerId: parsed.container_id,
            objectId: parsed.object_id,
        };
    }
}
