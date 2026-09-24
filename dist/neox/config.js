import { createPublicClient, createWalletClient, http, } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
import { defineNeoxT4, NEOX_T4_CHAIN_ID, NEOX_T4_IDENTITY_REGISTRY, NEOX_T4_RPC_URL, } from "./constants.js";
export function normalizePrivateKey(value) {
    const trimmed = value.trim();
    const hex = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
        throw new Error("Private key must be 32 bytes of hex");
    }
    return hex;
}
export function loadPrivateKeyFromEnv() {
    const inline = process.env.PRIVATE_KEY || process.env.NEO_X_T4_PRIVATE_KEY;
    if (inline) {
        return normalizePrivateKey(inline);
    }
    const keyFile = process.env.PRIVATE_KEY_FILE;
    if (keyFile) {
        if (!fs.existsSync(keyFile)) {
            throw new Error(`PRIVATE_KEY_FILE not found: ${keyFile}`);
        }
        return normalizePrivateKey(fs.readFileSync(keyFile, "utf8"));
    }
    throw new Error("No signing key configured. Set PRIVATE_KEY, NEO_X_T4_PRIVATE_KEY, or PRIVATE_KEY_FILE.");
}
export function resolveRuntimeConfig(overrides = {}) {
    const rpcUrl = overrides.rpcUrl || process.env.RPC_URL || process.env.NEO_X_T4_RPC_URL || NEOX_T4_RPC_URL;
    const registry = (overrides.registry ||
        process.env.IDENTITY_REGISTRY ||
        NEOX_T4_IDENTITY_REGISTRY);
    const chainId = overrides.chainId ?? Number(process.env.CHAIN_ID || NEOX_T4_CHAIN_ID);
    return { rpcUrl, registry, chainId };
}
export function createNeoxPublicClient(rpcUrl) {
    const chain = defineNeoxT4(rpcUrl);
    return createPublicClient({
        chain,
        transport: http(rpcUrl),
    });
}
export function createNeoxWalletClient(rpcUrl, account) {
    const chain = defineNeoxT4(rpcUrl);
    return createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
    });
}
export function accountFromPrivateKey(privateKey) {
    return privateKeyToAccount(privateKey);
}
