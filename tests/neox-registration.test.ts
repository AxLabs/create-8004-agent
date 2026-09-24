import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    encodeAbiParameters,
    encodeEventTopics,
    getAddress,
    type Address,
    type Hex,
    type TransactionReceipt,
} from "viem";
import { IDENTITY_REGISTRY_ABI } from "../src/neox/abi.js";
import { decodeRegisteredFromReceipt, decodeURIUpdatedFromReceipt } from "../src/neox/events.js";
import {
    buildRegistrationMetadata,
    decodeMetadataDataUri,
    encodeMetadataDataUri,
    parseAgentId,
    registrationRefMatches,
} from "../src/neox/metadata.js";
import { assertChainId, nextActionForState, readRegistryIdentity, runPreflight } from "../src/neox/preflight.js";
import { canReuseMetadataPublication, registerOrResume } from "../src/neox/register.js";
import { emptyState, hasMinted, isComplete, saveState } from "../src/neox/state.js";
import { NEOX_T4_IDENTITY_REGISTRY } from "../src/neox/constants.js";
import type { AgentProjectConfig, RegistrationState } from "../src/neox/types.js";
import { verifyOnChain } from "../src/neox/verify.js";

const REGISTRY = NEOX_T4_IDENTITY_REGISTRY;
const OTHER = "0x0000000000000000000000000000000000000abc" as Address;
const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;

const CONFIG: AgentProjectConfig = {
    name: "AxLabs Neo X Scanner Test 01",
    description: "Fixture",
    image: "data:image/png;base64,aaa",
    projectId: "neox-scanner-test-01",
    services: [
        {
            name: "A2A",
            endpoint: "https://scanner.example/.well-known/agent-card.json",
        },
    ],
};

function padTopic(value: bigint | Address): Hex {
    if (typeof value === "bigint") {
        return `0x${value.toString(16).padStart(64, "0")}` as Hex;
    }
    return `0x${value.slice(2).toLowerCase().padStart(64, "0")}` as Hex;
}

function registeredLog(registry: Address, agentId: bigint, uri: string, owner: Address) {
    const topics = encodeEventTopics({
        abi: IDENTITY_REGISTRY_ABI,
        eventName: "Registered",
        args: { agentId, owner },
    });
    return {
        address: registry,
        topics,
        data: encodeAbiParameters([{ type: "string" }], [uri]),
        blockNumber: 1n,
        transactionHash: "0xreg" as Hex,
        blockHash: "0xblock" as Hex,
        logIndex: 1,
        transactionIndex: 0,
        removed: false,
    };
}

function uriUpdatedLog(registry: Address, agentId: bigint, uri: string, updatedBy: Address) {
    const topics = encodeEventTopics({
        abi: IDENTITY_REGISTRY_ABI,
        eventName: "URIUpdated",
        args: { agentId, updatedBy },
    });
    return {
        address: registry,
        topics,
        data: encodeAbiParameters([{ type: "string" }], [uri]),
        blockNumber: 2n,
        transactionHash: "0xuri" as Hex,
        blockHash: "0xblock2" as Hex,
        logIndex: 0,
        transactionIndex: 0,
        removed: false,
    };
}

function transferLog(registry: Address, tokenId: bigint) {
    return {
        address: registry,
        topics: [
            TRANSFER_TOPIC,
            padTopic("0x0000000000000000000000000000000000000000"),
            padTopic(OWNER),
            padTopic(tokenId),
        ] as [Hex, ...Hex[]],
        data: "0x" as Hex,
        blockNumber: 1n,
        transactionHash: "0xreg" as Hex,
        blockHash: "0xblock" as Hex,
        logIndex: 0,
        transactionIndex: 0,
        removed: false,
    };
}

describe("receipt event decoding", () => {
    it("decodes Registered agent ID 0 from the configured registry only", () => {
        const receipt = {
            logs: [
                transferLog(REGISTRY, 99n),
                registeredLog(OTHER, 7n, "", OWNER),
                registeredLog(REGISTRY, 0n, "", OWNER),
            ],
        } as Pick<TransactionReceipt, "logs">;

        const decoded = decodeRegisteredFromReceipt(receipt, REGISTRY);
        expect(decoded.agentId).toBe(0n);
        expect(decoded.agentIdDecimal).toBe("0");
        expect(decoded.owner).toBe(getAddress(OWNER));
        expect(hasMinted({ ...emptyState("p"), agentId: decoded.agentIdDecimal })).toBe(true);
    });

    it("does not treat an unrelated Transfer as the agent id", () => {
        const receipt = {
            logs: [transferLog(REGISTRY, 42n)],
        } as Pick<TransactionReceipt, "logs">;
        expect(() => decodeRegisteredFromReceipt(receipt, REGISTRY)).toThrow(/No Registered event/);
    });

    it("decodes URIUpdated for the minted id", () => {
        const uri = "data:application/json;base64,e30=";
        const receipt = {
            logs: [uriUpdatedLog(REGISTRY, 0n, uri, OWNER)],
        } as Pick<TransactionReceipt, "logs">;
        const decoded = decodeURIUpdatedFromReceipt(receipt, REGISTRY, 0n);
        expect(decoded.agentIdDecimal).toBe("0");
        expect(decoded.newURI).toBe(uri);
    });
});

describe("metadata encoding and readback", () => {
    it("round-trips registration-v1 data URIs including agent ID 0", () => {
        const metadata = buildRegistrationMetadata(CONFIG, 0n, REGISTRY);
        expect(metadata.type).toContain("registration-v1");
        expect(metadata.services).toEqual(CONFIG.services);
        expect(metadata.active).toBe(false);
        expect(metadata.x402Support).toBe(false);
        expect(metadata.supportedTrust).toEqual([]);
        expect(metadata.registrations[0]).toEqual({
            agentId: 0,
            agentRegistry: `eip155:12227332:${REGISTRY}`,
        });

        const uri = encodeMetadataDataUri(metadata);
        expect(uri.startsWith("data:application/json;base64,")).toBe(true);
        const decoded = decodeMetadataDataUri(uri);
        expect(decoded).toEqual(metadata);
        expect(registrationRefMatches(decoded, 0n, REGISTRY)).toBe(true);
        expect(parseAgentId(decoded.registrations[0].agentId)).toBe(0n);
    });

    it("rejects malformed, noncanonical, and non-JSON inline metadata", () => {
        expect(() =>
            decodeMetadataDataUri("data:application/json;base64,%%%%")
        ).toThrow(/base64/);
        expect(() =>
            decodeMetadataDataUri("data:application/json;base64,e30")
        ).toThrow(/base64/);
        expect(() =>
            decodeMetadataDataUri(
                `data:application/json;base64,${Buffer.from("not json", "utf8").toString("base64")}`
            )
        ).toThrow(/JSON/);
    });

    it("only reuses a canonical inline URI containing the intended metadata", () => {
        const metadata = buildRegistrationMetadata(CONFIG, 0n, REGISTRY);
        const uri = encodeMetadataDataUri(metadata);
        const state: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "minted",
            agentId: "0",
            agentURI: uri,
            metadata,
            metadataStorage: { backend: "inline", uri },
        };

        expect(canReuseMetadataPublication(state, metadata)).toBe(true);
        expect(canReuseMetadataPublication({
            ...state,
            agentURI: "data:application/json;base64,%%%%",
            metadataStorage: {
                backend: "inline",
                uri: "data:application/json;base64,%%%%",
            },
        }, metadata)).toBe(false);
    });

    it("keeps inline registrations verifiable", async () => {
        const metadata = buildRegistrationMetadata(CONFIG, 0n, REGISTRY);
        const uri = encodeMetadataDataUri(metadata);
        const state: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "uri-set",
            agentId: "0",
            owner: OWNER,
            agentURI: uri,
            metadata,
            metadataStorage: { backend: "inline", uri },
        };
        const client = {
            readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
                if (functionName === "ownerOf" || functionName === "getAgentWallet") return OWNER;
                if (functionName === "tokenURI") return uri;
                throw new Error(`unexpected ${functionName}`);
            }),
        };
        const result = await verifyOnChain({
            client: client as never,
            registry: REGISTRY,
            state,
            config: CONFIG,
            expectedOwner: OWNER,
        });
        expect(result.metadataStorage.backend).toBe("inline");
        expect(result.metadataMatches).toBe(true);
        expect(result.registrationRefMatches).toBe(true);
    });
});

describe("preflight rejection", () => {
    it("rejects a wrong chain id before writes", () => {
        expect(() => assertChainId(1)).toThrow(/Wrong chain/);
        expect(() => assertChainId(47763)).toThrow(/Wrong chain/);
        expect(() => assertChainId(12227332)).not.toThrow();
    });

    it("rejects a missing identity contract", async () => {
        const client = {
            getBytecode: async () => "0x" as Hex,
        };
        await expect(
            readRegistryIdentity(client as never, REGISTRY)
        ).rejects.toThrow(/No contract bytecode/);
    });

    it("rejects a contract that cannot serve name/getVersion", async () => {
        const client = {
            getBytecode: async () => "0x60016000" as Hex,
            readContract: async () => {
                throw new Error("execution reverted");
            },
        };
        await expect(readRegistryIdentity(client as never, REGISTRY)).rejects.toThrow(
            /missing readable Identity Registry methods/
        );
    });
});

describe("resume after minting", () => {
    it("treats agent ID 0 as minted and does not remint a completed project", async () => {
        const minted: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "minted",
            agentId: "0",
            owner: OWNER,
        };
        const complete: RegistrationState = {
            ...minted,
            stage: "verified",
            metadata: buildRegistrationMetadata(CONFIG, 0n, REGISTRY),
            agentURI: encodeMetadataDataUri(buildRegistrationMetadata(CONFIG, 0n, REGISTRY)),
            metadataStorage: {
                backend: "inline",
                uri: encodeMetadataDataUri(buildRegistrationMetadata(CONFIG, 0n, REGISTRY)),
            },
        };

        expect(nextActionForState(minted)).toBe("setAgentURI");
        expect(nextActionForState(complete)).toBe("already-complete");
        expect(isComplete(complete)).toBe(true);

        const writeContract = vi.fn();
        const result = await registerOrResume(
            {
                publicClient: {} as never,
                walletClient: { writeContract, chain: undefined, account: undefined } as never,
                signer: OWNER,
                registry: REGISTRY,
                projectDir: os.tmpdir(),
                config: CONFIG,
            },
            complete
        );
        expect(writeContract).not.toHaveBeenCalled();
        expect(result.agentId).toBe("0");
    });

    it("does not silently update a completed registration when metadata changes", async () => {
        const metadata = buildRegistrationMetadata(CONFIG, 0n, REGISTRY);
        const uri = encodeMetadataDataUri(metadata);
        const complete: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "verified",
            agentId: "0",
            owner: OWNER,
            metadata,
            agentURI: uri,
            metadataStorage: { backend: "inline", uri },
        };
        const changedConfig: AgentProjectConfig = {
            ...CONFIG,
            services: [{
                name: "A2A",
                endpoint: "https://changed.example/.well-known/agent-card.json",
            }],
        };
        const writeContract = vi.fn();

        await expect(registerOrResume({
            publicClient: {} as never,
            walletClient: { writeContract, chain: undefined, account: undefined } as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir: os.tmpdir(),
            config: changedConfig,
        }, complete)).rejects.toThrow(/already complete.*differs/i);
        expect(writeContract).not.toHaveBeenCalled();
    });

    it("persists agent ID 0 without treating it as empty", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neox-state-"));
        const state: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "minted",
            agentId: "0",
        };
        saveState(dir, state);
        const loaded = JSON.parse(fs.readFileSync(path.join(dir, ".registration-state.json"), "utf8"));
        expect(loaded.agentId).toBe("0");
        expect(hasMinted(loaded)).toBe(true);
    });
});

describe("runPreflight chain guard", () => {
    it("fails fast when eth_chainId is not Neo X T4", async () => {
        const client = {
            getChainId: async () => 84532,
        };
        await expect(
            runPreflight({
                client: client as never,
                registry: REGISTRY,
                signer: OWNER,
                state: emptyState(CONFIG.projectId),
            })
        ).rejects.toThrow(/Wrong chain/);
    });
});
