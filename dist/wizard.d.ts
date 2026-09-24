import { type ChainKey, type TrustModel, type X402Provider } from "./config.js";
import { type SolanaChainKey } from "./config-solana.js";
export interface WizardAnswers {
    projectDir: string;
    agentName: string;
    agentDescription: string;
    agentImage: string;
    features: ("a2a" | "mcp" | "x402")[];
    a2aStreaming: boolean;
    chain: ChainKey | SolanaChainKey;
    trustModels: TrustModel[];
    agentWallet: string;
    generatedPrivateKey?: string;
    x402Provider?: X402Provider;
    skills?: string[];
    domains?: string[];
    /** Public agent-card URL for ERC-8004 A2A service metadata (Neo X). */
    a2aEndpoint?: string;
    /** Public HTTP MCP endpoint for ERC-8004 MCP service metadata (Neo X). */
    mcpEndpoint?: string;
    /** OASF taxonomy reference endpoint (Neo X). */
    oasfEndpoint?: string;
}
export { isSolanaChain } from "./config-solana.js";
export declare const hasFeature: (answers: WizardAnswers, feature: "a2a" | "mcp" | "x402") => boolean;
export declare function runWizard(): Promise<WizardAnswers>;
