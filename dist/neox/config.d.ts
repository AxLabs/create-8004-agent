import { type Account, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
export interface NeoxRuntimeConfig {
    rpcUrl: string;
    registry: Address;
    chainId: number;
    privateKey?: Hex;
}
export declare function normalizePrivateKey(value: string): Hex;
export declare function loadPrivateKeyFromEnv(): Hex;
export declare function resolveRuntimeConfig(overrides?: Partial<NeoxRuntimeConfig>): NeoxRuntimeConfig;
export declare function createNeoxPublicClient(rpcUrl: string): PublicClient;
export declare function createNeoxWalletClient(rpcUrl: string, account: Account): WalletClient;
export declare function accountFromPrivateKey(privateKey: Hex): Account;
