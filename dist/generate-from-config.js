import fs from "node:fs";
import path from "node:path";
import { CHAINS } from "./config.js";
import { isSolanaChain } from "./config-solana.js";
export function wizardAnswersFromConfig(raw) {
    if (!raw.projectDir || !raw.agentName || !raw.agentDescription || !raw.chain) {
        throw new Error("Config requires projectDir, agentName, agentDescription, and chain");
    }
    if (!isSolanaChain(raw.chain) && !(raw.chain in CHAINS)) {
        throw new Error(`Unknown chain: ${raw.chain}`);
    }
    return {
        projectDir: raw.projectDir,
        agentName: raw.agentName,
        agentDescription: raw.agentDescription,
        agentImage: raw.agentImage ?? "",
        features: raw.features ?? [],
        a2aStreaming: raw.a2aStreaming ?? false,
        chain: raw.chain,
        trustModels: raw.trustModels ?? [],
        agentWallet: raw.agentWallet ?? "",
        generatedPrivateKey: raw.generatedPrivateKey,
    };
}
export function readGenerateConfigFile(configPath) {
    const resolved = path.resolve(configPath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Config file not found: ${resolved}`);
    }
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
}
