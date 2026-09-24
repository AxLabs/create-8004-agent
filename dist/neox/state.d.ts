import { type Address, type Hex, type TransactionReceipt } from "viem";
import type { PublishedMetadata, RegistrationState } from "./types.js";
export declare function stateFilePath(projectDir?: string): string;
export declare function emptyState(projectId: string, registry?: `0x${string}`): RegistrationState;
export declare function loadState(projectDir: string, projectId: string, registry: Address): RegistrationState;
export declare function saveState(projectDir: string, state: RegistrationState): void;
export declare function persistPendingTx(projectDir: string, state: RegistrationState, kind: "register" | "setAgentURI", hash: Hex): RegistrationState;
export declare function persistMinted(projectDir: string, state: RegistrationState, args: {
    agentId: string;
    owner: Address;
    receipt: Pick<TransactionReceipt, "transactionHash" | "blockNumber" | "blockHash">;
}): RegistrationState;
export declare function persistUriSet(projectDir: string, state: RegistrationState, args: {
    agentURI: string;
    receipt: Pick<TransactionReceipt, "transactionHash" | "blockNumber" | "blockHash">;
    metadata: RegistrationState["metadata"];
}): RegistrationState;
export declare function persistMetadataPublished(projectDir: string, state: RegistrationState, metadata: NonNullable<RegistrationState["metadata"]>, publication: PublishedMetadata): RegistrationState;
export declare function persistVerified(projectDir: string, state: RegistrationState, agentWallet: Address): RegistrationState;
export declare function isComplete(state: RegistrationState): boolean;
export declare function hasMinted(state: RegistrationState): boolean;
