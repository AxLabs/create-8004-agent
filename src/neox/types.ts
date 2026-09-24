import type { Address, Hex } from "viem";

export type RegistrationStage =
    | "not-started"
    | "register-broadcast"
    | "minted"
    | "set-uri-broadcast"
    | "uri-set"
    | "verified";

export interface AgentProjectConfig {
    name: string;
    description: string;
    image: string;
    projectId: string;
    chainId?: number;
    registry?: Address;
    rpcUrl?: string;
}

export interface RegistrationRecord {
    agentId: number | string;
    agentRegistry: string;
}

export interface AgentRegistrationMetadata {
    type: string;
    name: string;
    description: string;
    image: string;
    services: [];
    active: false;
    x402Support: false;
    supportedTrust: [];
    registrations: RegistrationRecord[];
}

export interface RegistrationState {
    chainId: number;
    registry: Address;
    projectId: string;
    stage: RegistrationStage;
    signer?: Address;
    /** Decimal string. Agent ID 0 is valid. */
    agentId?: string;
    owner?: Address;
    agentWallet?: Address;
    agentURI?: string;
    registerTxHash?: Hex;
    registerBlockNumber?: string;
    registerBlockHash?: Hex;
    setUriTxHash?: Hex;
    setUriBlockNumber?: string;
    setUriBlockHash?: Hex;
    pendingTxHash?: Hex;
    pendingKind?: "register" | "setAgentURI";
    metadata?: AgentRegistrationMetadata;
    verifiedAt?: string;
}

export interface FeeQuote {
    gasPrice: bigint;
    baseFee: bigint;
    maxPriorityFeePerGas: bigint;
    maxFeePerGas: bigint;
    gasEstimate?: bigint;
    estimatedFeeWei?: bigint;
}

export interface PreflightReport {
    chainId: number;
    registry: Address;
    signer: Address;
    balanceWei: bigint;
    registryName: string;
    registryVersion: string;
    bytecodeLength: number;
    fees: FeeQuote;
    nextAction: "register" | "setAgentURI" | "already-complete";
    agentId?: string;
    estimatedFeeWei: bigint;
}

export interface VerificationResult {
    agentId: string;
    owner: Address;
    agentWallet: Address;
    tokenURI: string;
    decodedMetadata: AgentRegistrationMetadata;
    metadataMatches: boolean;
    registrationRefMatches: boolean;
}

export interface SecretFreeRegistrationResult {
    chainId: number;
    registry: Address;
    agentId: string;
    owner: Address;
    agentWallet: Address;
    finalURI: string;
    decodedMetadata: AgentRegistrationMetadata;
    transactionHashes: {
        register?: Hex;
        setAgentURI?: Hex;
    };
    receipts: {
        register?: { blockNumber: string; blockHash: Hex };
        setAgentURI?: { blockNumber: string; blockHash: Hex };
    };
    verification: VerificationResult;
    explorer: {
        registerTx?: string;
        setAgentURITx?: string;
        registry?: string;
    };
}
