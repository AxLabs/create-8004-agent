import fs from "node:fs";
import path from "node:path";
import { getAddress, type Address, type Hex, type TransactionReceipt } from "viem";
import { NEOX_T4_CHAIN_ID, NEOX_T4_IDENTITY_REGISTRY, STATE_FILE_NAME } from "./constants.js";
import type { PublishedMetadata, RegistrationStage, RegistrationState } from "./types.js";

const TERMINAL_STAGES: RegistrationStage[] = ["uri-set", "verified"];

export function stateFilePath(projectDir = process.cwd()): string {
    return path.join(projectDir, STATE_FILE_NAME);
}

export function emptyState(projectId: string, registry = NEOX_T4_IDENTITY_REGISTRY): RegistrationState {
    return {
        chainId: NEOX_T4_CHAIN_ID,
        registry,
        projectId,
        stage: "not-started",
    };
}

export function loadState(projectDir: string, projectId: string, registry: Address): RegistrationState {
    const file = stateFilePath(projectDir);
    if (!fs.existsSync(file)) {
        return emptyState(projectId, registry);
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as RegistrationState;
    if (parsed.chainId !== NEOX_T4_CHAIN_ID) {
        throw new Error(
            `State chainId ${parsed.chainId} does not match Neo X T4 ${NEOX_T4_CHAIN_ID}`
        );
    }
    if (getAddress(parsed.registry) !== getAddress(registry)) {
        throw new Error(
            `State registry ${parsed.registry} does not match configured registry ${registry}`
        );
    }
    if (parsed.projectId !== projectId) {
        throw new Error(
            `State projectId "${parsed.projectId}" does not match "${projectId}"`
        );
    }
    return parsed;
}

export function saveState(projectDir: string, state: RegistrationState): void {
    const file = stateFilePath(projectDir);
    fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

export function persistPendingTx(
    projectDir: string,
    state: RegistrationState,
    kind: "register" | "setAgentURI",
    hash: Hex
): RegistrationState {
    const next: RegistrationState = {
        ...state,
        pendingTxHash: hash,
        pendingKind: kind,
        stage: kind === "register" ? "register-broadcast" : "set-uri-broadcast",
        registerTxHash: kind === "register" ? hash : state.registerTxHash,
        setUriTxHash: kind === "setAgentURI" ? hash : state.setUriTxHash,
    };
    saveState(projectDir, next);
    return next;
}

export function persistMinted(
    projectDir: string,
    state: RegistrationState,
    args: {
        agentId: string;
        owner: Address;
        receipt: Pick<TransactionReceipt, "transactionHash" | "blockNumber" | "blockHash">;
    }
): RegistrationState {
    const next: RegistrationState = {
        ...state,
        stage: "minted",
        agentId: args.agentId,
        owner: args.owner,
        registerTxHash: args.receipt.transactionHash,
        registerBlockNumber: args.receipt.blockNumber.toString(10),
        registerBlockHash: args.receipt.blockHash,
        pendingTxHash: undefined,
        pendingKind: undefined,
    };
    saveState(projectDir, next);
    return next;
}

export function persistUriSet(
    projectDir: string,
    state: RegistrationState,
    args: {
        agentURI: string;
        receipt: Pick<TransactionReceipt, "transactionHash" | "blockNumber" | "blockHash">;
        metadata: RegistrationState["metadata"];
    }
): RegistrationState {
    const next: RegistrationState = {
        ...state,
        stage: "uri-set",
        agentURI: args.agentURI,
        metadata: args.metadata,
        setUriTxHash: args.receipt.transactionHash,
        setUriBlockNumber: args.receipt.blockNumber.toString(10),
        setUriBlockHash: args.receipt.blockHash,
        pendingTxHash: undefined,
        pendingKind: undefined,
    };
    saveState(projectDir, next);
    return next;
}

export function persistMetadataPublished(
    projectDir: string,
    state: RegistrationState,
    metadata: NonNullable<RegistrationState["metadata"]>,
    publication: PublishedMetadata
): RegistrationState {
    const next: RegistrationState = {
        ...state,
        metadata,
        agentURI: publication.uri,
        metadataStorage: publication,
    };
    saveState(projectDir, next);
    return next;
}

export function persistVerified(
    projectDir: string,
    state: RegistrationState,
    agentWallet: Address
): RegistrationState {
    const next: RegistrationState = {
        ...state,
        stage: "verified",
        agentWallet,
        verifiedAt: new Date().toISOString(),
    };
    saveState(projectDir, next);
    return next;
}

export function isComplete(state: RegistrationState): boolean {
    return TERMINAL_STAGES.includes(state.stage) && state.agentId !== undefined && Boolean(state.agentURI);
}

export function hasMinted(state: RegistrationState): boolean {
    return state.agentId !== undefined && state.agentId !== "";
}
