import type { Address, PublicClient, WalletClient } from "viem";
import type { AgentProjectConfig, RegistrationState } from "./types.js";
import type { MetadataStorage } from "./storage/types.js";
export interface RegisterDeps {
    publicClient: PublicClient;
    walletClient: WalletClient;
    signer: Address;
    registry: Address;
    projectDir: string;
    config: AgentProjectConfig;
    storage?: MetadataStorage;
}
export declare function reconcilePending(deps: RegisterDeps, state: RegistrationState): Promise<RegistrationState>;
export declare function registerOrResume(deps: RegisterDeps, state: RegistrationState): Promise<RegistrationState>;
