import { decodeEventLog, getAddress, toEventSelector, } from "viem";
import { IDENTITY_REGISTRY_ABI, REGISTERED_SIGNATURE, URI_UPDATED_SIGNATURE } from "./abi.js";
import { agentIdToDecimalString } from "./metadata.js";
export const REGISTERED_TOPIC = toEventSelector(REGISTERED_SIGNATURE);
export const URI_UPDATED_TOPIC = toEventSelector(URI_UPDATED_SIGNATURE);
function isRegistryLog(log, registry) {
    return getAddress(log.address) === getAddress(registry);
}
export function decodeRegisteredFromReceipt(receipt, registry) {
    const matches = [];
    for (const log of receipt.logs) {
        if (!isRegistryLog(log, registry))
            continue;
        if (log.topics[0] !== REGISTERED_TOPIC)
            continue;
        const decoded = decodeEventLog({
            abi: IDENTITY_REGISTRY_ABI,
            data: log.data,
            topics: log.topics,
        });
        if (decoded.eventName !== "Registered")
            continue;
        const agentId = decoded.args.agentId;
        matches.push({
            agentId,
            agentIdDecimal: agentIdToDecimalString(agentId),
            agentURI: decoded.args.agentURI,
            owner: decoded.args.owner,
        });
    }
    if (matches.length === 0) {
        throw new Error(`No Registered event from registry ${registry} in receipt. Refusing to infer agentId from Transfer, balanceOf, or counters.`);
    }
    if (matches.length > 1) {
        throw new Error(`Expected exactly one Registered event from ${registry}, found ${matches.length}`);
    }
    return matches[0];
}
export function decodeURIUpdatedFromReceipt(receipt, registry, expectedAgentId) {
    const matches = [];
    for (const log of receipt.logs) {
        if (!isRegistryLog(log, registry))
            continue;
        if (log.topics[0] !== URI_UPDATED_TOPIC)
            continue;
        const decoded = decodeEventLog({
            abi: IDENTITY_REGISTRY_ABI,
            data: log.data,
            topics: log.topics,
        });
        if (decoded.eventName !== "URIUpdated")
            continue;
        const agentId = decoded.args.agentId;
        if (expectedAgentId !== undefined && agentId !== expectedAgentId)
            continue;
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
export function hasAgentId(agentId) {
    return agentId !== undefined && agentId !== null && agentId !== "";
}
