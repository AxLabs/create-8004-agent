import {
    decodeEventLog,
    getAddress,
    toEventSelector,
    type Address,
    type Log,
    type TransactionReceipt,
} from "viem";
import { IDENTITY_REGISTRY_ABI, REGISTERED_SIGNATURE, URI_UPDATED_SIGNATURE } from "./abi.js";
import { agentIdToDecimalString } from "./metadata.js";

export const REGISTERED_TOPIC = toEventSelector(
    REGISTERED_SIGNATURE as "Registered(uint256,string,address)"
);
export const URI_UPDATED_TOPIC = toEventSelector(
    URI_UPDATED_SIGNATURE as "URIUpdated(uint256,string,address)"
);

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

function isRegistryLog(log: Log, registry: Address): boolean {
    return getAddress(log.address) === getAddress(registry);
}

export function decodeRegisteredFromReceipt(
    receipt: Pick<TransactionReceipt, "logs">,
    registry: Address
): DecodedRegistered {
    const matches: DecodedRegistered[] = [];

    for (const log of receipt.logs) {
        if (!isRegistryLog(log, registry)) continue;
        if (log.topics[0] !== REGISTERED_TOPIC) continue;

        const decoded = decodeEventLog({
            abi: IDENTITY_REGISTRY_ABI,
            data: log.data,
            topics: log.topics,
        });

        if (decoded.eventName !== "Registered") continue;

        const agentId = decoded.args.agentId;
        matches.push({
            agentId,
            agentIdDecimal: agentIdToDecimalString(agentId),
            agentURI: decoded.args.agentURI,
            owner: decoded.args.owner,
        });
    }

    if (matches.length === 0) {
        throw new Error(
            `No Registered event from registry ${registry} in receipt. Refusing to infer agentId from Transfer, balanceOf, or counters.`
        );
    }
    if (matches.length > 1) {
        throw new Error(`Expected exactly one Registered event from ${registry}, found ${matches.length}`);
    }
    return matches[0];
}

export function decodeURIUpdatedFromReceipt(
    receipt: Pick<TransactionReceipt, "logs">,
    registry: Address,
    expectedAgentId?: bigint
): DecodedURIUpdated {
    const matches: DecodedURIUpdated[] = [];

    for (const log of receipt.logs) {
        if (!isRegistryLog(log, registry)) continue;
        if (log.topics[0] !== URI_UPDATED_TOPIC) continue;

        const decoded = decodeEventLog({
            abi: IDENTITY_REGISTRY_ABI,
            data: log.data,
            topics: log.topics,
        });

        if (decoded.eventName !== "URIUpdated") continue;

        const agentId = decoded.args.agentId;
        if (expectedAgentId !== undefined && agentId !== expectedAgentId) continue;

        matches.push({
            agentId,
            agentIdDecimal: agentIdToDecimalString(agentId),
            newURI: decoded.args.newURI,
            updatedBy: decoded.args.updatedBy,
        });
    }

    if (matches.length === 0) {
        throw new Error(`No URIUpdated event from registry ${registry} in receipt`);
    }
    if (matches.length > 1) {
        throw new Error(`Expected exactly one URIUpdated event from ${registry}, found ${matches.length}`);
    }
    return matches[0];
}

export function hasAgentId(agentId: bigint | string | undefined | null): agentId is bigint | string {
    return agentId !== undefined && agentId !== null && agentId !== "";
}
