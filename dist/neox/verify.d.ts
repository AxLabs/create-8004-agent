import { type Address, type PublicClient } from "viem";
import type { AgentProjectConfig, RegistrationState, VerificationResult } from "./types.js";
export declare function verifyOnChain(args: {
    client: PublicClient;
    registry: Address;
    state: RegistrationState;
    config: AgentProjectConfig;
    expectedOwner: Address;
}): Promise<VerificationResult>;
