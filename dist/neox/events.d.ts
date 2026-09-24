import { type Address, type TransactionReceipt } from "viem";
export declare const REGISTERED_TOPIC: `0x${string}`;
export declare const URI_UPDATED_TOPIC: `0x${string}`;
export interface DecodedRegistered {
    agentId: bigint;
    agentIdDecimal: string;
    agentURI: string;
    owner: Address;
}
export interface DecodedURIUpdated {
    agentId: bigint;
    agentIdDecimal: string;
    newURI: string;
    updatedBy: Address;
}
export declare function decodeRegisteredFromReceipt(receipt: Pick<TransactionReceipt, "logs">, registry: Address): DecodedRegistered;
export declare function decodeURIUpdatedFromReceipt(receipt: Pick<TransactionReceipt, "logs">, registry: Address, expectedAgentId?: bigint): DecodedURIUpdated;
export declare function hasAgentId(agentId: bigint | string | undefined | null): agentId is bigint | string;
