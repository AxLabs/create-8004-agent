import { decodeEventLog, getAddress } from "viem";
import { IDENTITY_REGISTRY_ABI } from "./abi.js";
import { REGISTERED_TOPIC, URI_UPDATED_TOPIC } from "./events.js";
import { agentIdToDecimalString } from "./metadata.js";
export async function discoverRegistryLogs(args) {
    const logs = await args.client.getLogs({
        address: args.registry,
        fromBlock: args.fromBlock,
        toBlock: args.toBlock,
    });
    const discovered = [];
    for (const log of logs) {
        if (getAddress(log.address) !== getAddress(args.registry))
            continue;
        if (log.topics[0] !== REGISTERED_TOPIC && log.topics[0] !== URI_UPDATED_TOPIC)
            continue;
        try {
            const decoded = decodeEventLog({
                abi: IDENTITY_REGISTRY_ABI,
                data: log.data,
                topics: log.topics,
            });
            if (decoded.eventName === "Registered") {
                discovered.push({
                    event: "Registered",
                    agentId: agentIdToDecimalString(decoded.args.agentId),
                    ownerOrUpdater: decoded.args.owner,
                    uri: decoded.args.agentURI,
                    blockNumber: log.blockNumber.toString(10),
                    transactionHash: log.transactionHash,
                });
            }
            if (decoded.eventName === "URIUpdated") {
                discovered.push({
                    event: "URIUpdated",
                    agentId: agentIdToDecimalString(decoded.args.agentId),
                    ownerOrUpdater: decoded.args.updatedBy,
                    uri: decoded.args.newURI,
                    blockNumber: log.blockNumber.toString(10),
                    transactionHash: log.transactionHash,
                });
            }
        }
        catch {
            // Ignore logs that do not match the Identity Registry ABI.
        }
    }
    return discovered;
}
