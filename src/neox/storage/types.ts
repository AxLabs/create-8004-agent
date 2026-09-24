import type { Address } from "viem";
import type { AgentRegistrationMetadata, PublishedMetadata } from "../types.js";

export interface PublishMetadataInput {
    metadata: AgentRegistrationMetadata;
    projectId: string;
    agentId: bigint;
    chainId: number;
    registry: Address;
}

export interface MetadataStorage {
    readonly backend: PublishedMetadata["backend"];
    publish(input: PublishMetadataInput): Promise<PublishedMetadata>;
}

export type FetchLike = typeof fetch;
