import { type Address, type PublicClient } from "viem";
export interface DiscoveredIdentity {
    event: "Registered" | "URIUpdated";
    agentId: string;
    ownerOrUpdater: Address;
    uri: string;
    blockNumber: string;
    transactionHash: `0x${string}`;
}
export declare function discoverRegistryLogs(args: {
    client: PublicClient;
    registry: Address;
    fromBlock: bigint;
    toBlock: bigint;
}): Promise<DiscoveredIdentity[]>;
