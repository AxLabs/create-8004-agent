import fs from "node:fs";
import path from "node:path";
import { getAddress } from "viem";
import { NEOX_T4_CHAIN_ID, NEOX_T4_IDENTITY_REGISTRY, STATE_FILE_NAME } from "./constants.js";
const TERMINAL_STAGES = ["uri-set", "verified"];
export function stateFilePath(projectDir = process.cwd()) {
    return path.join(projectDir, STATE_FILE_NAME);
}
export function emptyState(projectId, registry = NEOX_T4_IDENTITY_REGISTRY) {
    return {
        chainId: NEOX_T4_CHAIN_ID,
        registry,
        projectId,
        stage: "not-started",
    };
}
export function loadState(projectDir, projectId, registry) {
    const file = stateFilePath(projectDir);
    if (!fs.existsSync(file)) {
        return emptyState(projectId, registry);
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed.chainId !== NEOX_T4_CHAIN_ID) {
        throw new Error(`State chainId ${parsed.chainId} does not match Neo X T4 ${NEOX_T4_CHAIN_ID}`);
    }
    if (getAddress(parsed.registry) !== getAddress(registry)) {
        throw new Error(`State registry ${parsed.registry} does not match configured registry ${registry}`);
    }
    if (parsed.projectId !== projectId) {
        throw new Error(`State projectId "${parsed.projectId}" does not match "${projectId}"`);
    }
    return parsed;
}
export function saveState(projectDir, state) {
    const file = stateFilePath(projectDir);
    fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}
export function persistPendingTx(projectDir, state, kind, hash) {
    const next = {
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
export function persistMinted(projectDir, state, args) {
    const next = {
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
export function persistUriSet(projectDir, state, args) {
    const next = {
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
export function persistMetadataPublished(projectDir, state, metadata, publication) {
    const next = {
        ...state,
        metadata,
        agentURI: publication.uri,
        metadataStorage: publication,
    };
    saveState(projectDir, next);
    return next;
}
export function persistVerified(projectDir, state, agentWallet) {
    const next = {
        ...state,
        stage: "verified",
        agentWallet,
        verifiedAt: new Date().toISOString(),
    };
    saveState(projectDir, next);
    return next;
}
export function isComplete(state) {
    return TERMINAL_STAGES.includes(state.stage) && state.agentId !== undefined && Boolean(state.agentURI);
}
export function hasMinted(state) {
    return state.agentId !== undefined && state.agentId !== "";
}
