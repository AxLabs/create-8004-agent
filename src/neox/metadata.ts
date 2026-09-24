import { agentRegistryCaip, NEOX_T4_CHAIN_ID, REGISTRATION_V1_TYPE } from "./constants.js";
import { normalizeAgentServices } from "./services.js";
import type { AgentProjectConfig, AgentRegistrationMetadata } from "./types.js";

const DATA_JSON_PREFIX = "data:application/json;base64,";

export function agentIdToDecimalString(agentId: bigint): string {
    return agentId.toString(10);
}

export function parseAgentId(value: string | number | bigint): bigint {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`Invalid agentId number: ${value}`);
        }
        return BigInt(value);
    }
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
        throw new Error(`Invalid agentId decimal string: ${value}`);
    }
    return BigInt(trimmed);
}

/**
 * JSON metadata uses a JSON number when the id is a safe integer (spec examples use numbers).
 * Callers must keep bigint/decimal-string forms for on-chain and exported state.
 */
export function agentIdForMetadataJson(agentId: bigint): number | string {
    if (agentId <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(agentId);
    }
    return agentId.toString(10);
}

export function buildRegistrationMetadata(
    config: Pick<AgentProjectConfig, "name" | "description" | "image" | "services">,
    agentId: bigint,
    registry: string,
    chainId = NEOX_T4_CHAIN_ID
): AgentRegistrationMetadata {
    const services = normalizeAgentServices(config.services ?? []);
    return {
        type: REGISTRATION_V1_TYPE,
        name: config.name,
        description: config.description,
        image: config.image,
        services,
        active: false,
        x402Support: false,
        supportedTrust: [],
        registrations: [
            {
                agentId: agentIdForMetadataJson(agentId),
                agentRegistry: agentRegistryCaip(registry, chainId),
            },
        ],
    };
}

export function encodeMetadataDataUri(metadata: AgentRegistrationMetadata): string {
    const json = JSON.stringify(metadata);
    return `${DATA_JSON_PREFIX}${Buffer.from(json, "utf8").toString("base64")}`;
}

export function decodeMetadataDataUri(uri: string): AgentRegistrationMetadata {
    if (!uri.startsWith(DATA_JSON_PREFIX)) {
        throw new Error(`tokenURI is not a base64 application/json data URI`);
    }
    const json = Buffer.from(uri.slice(DATA_JSON_PREFIX.length), "base64").toString("utf8");
    return JSON.parse(json) as AgentRegistrationMetadata;
}

export function metadataEquals(actual: AgentRegistrationMetadata, expected: AgentRegistrationMetadata): boolean {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

export function registrationRefMatches(
    metadata: AgentRegistrationMetadata,
    agentId: bigint,
    registry: string,
    chainId = NEOX_T4_CHAIN_ID
): boolean {
    const expected = agentRegistryCaip(registry, chainId);
    return metadata.registrations.some((entry) => {
        const id = parseAgentId(entry.agentId);
        return id === agentId && entry.agentRegistry === expected;
    });
}
