import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import { IDENTITY_REGISTRY_ABI } from "../src/neox/abi.js";
import { NEOX_T4_IDENTITY_REGISTRY } from "../src/neox/constants.js";
import { buildRegistrationMetadata } from "../src/neox/metadata.js";
import { registerOrResume } from "../src/neox/register.js";
import { buildSecretFreeResult } from "../src/neox/result.js";
import { emptyState } from "../src/neox/state.js";
import {
    NeofsMetadataStorage,
    validateNeofsStorageConfig,
} from "../src/neox/storage/neofs.js";
import type { MetadataStorage } from "../src/neox/storage/types.js";
import type { AgentProjectConfig, RegistrationState } from "../src/neox/types.js";
import { verifyOnChain } from "../src/neox/verify.js";

const REGISTRY = NEOX_T4_IDENTITY_REGISTRY;
const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const CONFIG: AgentProjectConfig = {
    name: "NeoFS test",
    description: "fixture",
    image: "https://example.com/agent.png",
    projectId: "neofs-test",
    metadataStorage: "neofs",
};
const STORAGE_CONFIG = {
    restGateway: "https://rest.example",
    containerId: "container-123",
    publicGateway: "https://public.example",
    bearerToken: "super-secret-token",
};

function input() {
    return {
        metadata: buildRegistrationMetadata(CONFIG, 7n, REGISTRY),
        projectId: CONFIG.projectId,
        agentId: 7n,
        chainId: 12227332,
        registry: REGISTRY,
    };
}

function uploadResponse(body: unknown, status = 200): Response {
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("NeoFS metadata storage", () => {
    it("uploads JSON with useful attributes, bearer auth, and validates public read-back", async () => {
        const metadata = input().metadata;
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(uploadResponse({ container_id: "container-123", object_id: "object-456" }))
            .mockResolvedValueOnce(uploadResponse(metadata));
        const storage = new NeofsMetadataStorage(STORAGE_CONFIG, fetchImpl);

        const publication = await storage.publish(input());

        expect(publication).toEqual({
            backend: "neofs",
            containerId: "container-123",
            objectId: "object-456",
            uri: "https://public.example/v1/objects/container-123/by_id/object-456",
        });
        const [uploadUrl, request] = fetchImpl.mock.calls[0] as [string, RequestInit];
        expect(uploadUrl).toBe("https://rest.example/v1/objects/container-123");
        expect(request.method).toBe("POST");
        expect(request.headers).toMatchObject({
            "content-type": "application/json",
            authorization: "Bearer super-secret-token",
        });
        expect(JSON.parse((request.headers as Record<string, string>)["x-attributes"])).toEqual({
            FileName: "registration.json",
            FilePath: `erc-8004/12227332/${REGISTRY.toLowerCase()}/7/registration.json`,
            "Content-Type": "application/json",
        });
        expect(JSON.parse(request.body as string)).toEqual(metadata);
    });

    it("requires all non-secret NeoFS settings", () => {
        expect(() => validateNeofsStorageConfig({ ...STORAGE_CONFIG, restGateway: "" })).toThrow(/NEOFS_REST_GATEWAY/);
        expect(() => validateNeofsStorageConfig({ ...STORAGE_CONFIG, containerId: "" })).toThrow(/NEOFS_CONTAINER_ID/);
        expect(() => validateNeofsStorageConfig({ ...STORAGE_CONFIG, publicGateway: "" })).toThrow(/NEOFS_PUBLIC_GATEWAY/);
    });

    it.each([
        ["unreachable gateway", vi.fn().mockRejectedValue(new Error("offline")), /NeoFS upload failed.*offline/],
        ["non-2xx upload", vi.fn().mockResolvedValue(uploadResponse({}, 503)), /HTTP 503/],
        ["malformed upload response", vi.fn().mockResolvedValue(uploadResponse("not-json")), /malformed JSON/],
        ["missing container id", vi.fn().mockResolvedValue(uploadResponse({ object_id: "object" })), /container_id/],
        ["missing object id", vi.fn().mockResolvedValue(uploadResponse({ container_id: "container" })), /object_id/],
    ])("rejects %s without exposing credentials", async (_name, fetchImpl, expected) => {
        const storage = new NeofsMetadataStorage(STORAGE_CONFIG, fetchImpl as typeof fetch);
        const error = await storage.publish(input()).catch((caught: unknown) => caught as Error);
        expect(error.message).toMatch(expected as RegExp);
        expect(error.message).not.toContain(STORAGE_CONFIG.bearerToken);
    });

    it("rejects failed, non-JSON, malformed, or mismatched public read-back", async () => {
        const upload = () => uploadResponse({ container_id: "container", object_id: "object" });
        const cases: Array<[Response, RegExp]> = [
            [uploadResponse({}, 404), /HTTP 404/],
            [new Response("{}", { headers: { "content-type": "text/plain" } }), /non-JSON/],
            [uploadResponse("not-json"), /malformed JSON/],
            [uploadResponse({ ...input().metadata, name: "different" }), /does not match/],
        ];
        for (const [readBack, expected] of cases) {
            const fetchImpl = vi.fn().mockResolvedValueOnce(upload()).mockResolvedValueOnce(readBack);
            const storage = new NeofsMetadataStorage(STORAGE_CONFIG, fetchImpl);
            await expect(storage.publish(input())).rejects.toThrow(expected);
        }
    });
});

function uriUpdatedReceipt(uri: string) {
    return {
        status: "success",
        transactionHash: `0x${"2".repeat(64)}` as Hex,
        blockNumber: 2n,
        blockHash: `0x${"3".repeat(64)}` as Hex,
        logs: [{
            address: REGISTRY,
            topics: encodeEventTopics({
                abi: IDENTITY_REGISTRY_ABI,
                eventName: "URIUpdated",
                args: { agentId: 7n, updatedBy: OWNER },
            }),
            data: encodeAbiParameters([{ type: "string" }], [uri]),
            blockNumber: 2n,
            transactionHash: `0x${"2".repeat(64)}` as Hex,
            blockHash: `0x${"3".repeat(64)}` as Hex,
            logIndex: 0,
            transactionIndex: 0,
            removed: false,
        }],
    };
}

function publicClient(uri: string) {
    return {
        getChainId: vi.fn().mockResolvedValue(12227332),
        getBytecode: vi.fn().mockResolvedValue("0x6001"),
        readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) =>
            functionName === "name" ? "Identity Registry" : "1.0.0"
        ),
        getBalance: vi.fn().mockResolvedValue(1n),
        getGasPrice: vi.fn().mockResolvedValue(20_000_000_000n),
        estimateMaxPriorityFeePerGas: vi.fn().mockResolvedValue(20_000_000_000n),
        getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: 1n }),
        simulateContract: vi.fn().mockResolvedValue({}),
        estimateContractGas: vi.fn().mockResolvedValue(100_000n),
        waitForTransactionReceipt: vi.fn().mockResolvedValue(uriUpdatedReceipt(uri)),
    };
}

describe("registration publication resume", () => {
    it("persists a successful NeoFS upload and reuses it after setAgentURI fails", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "neofs-resume-"));
        const uri = "https://public.example/v1/objects/container/by_id/object";
        const storage: MetadataStorage = {
            backend: "neofs",
            publish: vi.fn().mockResolvedValue({
                backend: "neofs",
                uri,
                containerId: "container",
                objectId: "object",
            }),
        };
        const minted: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "minted",
            agentId: "7",
            owner: OWNER,
        };
        const client = publicClient(uri);
        const firstWallet = { writeContract: vi.fn().mockRejectedValue(new Error("setAgentURI unavailable")) };

        await expect(registerOrResume({
            publicClient: client as never,
            walletClient: firstWallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
            storage,
        }, minted)).rejects.toThrow(/setAgentURI unavailable/);

        const saved = JSON.parse(fs.readFileSync(path.join(projectDir, ".registration-state.json"), "utf8")) as RegistrationState;
        expect(saved.stage).toBe("minted");
        expect(saved.metadataStorage).toEqual({
            backend: "neofs",
            uri,
            containerId: "container",
            objectId: "object",
        });
        expect(JSON.stringify(saved)).not.toContain(STORAGE_CONFIG.bearerToken);

        const secondWallet = {
            writeContract: vi.fn().mockResolvedValue(`0x${"2".repeat(64)}` as Hex),
            account: undefined,
            chain: undefined,
        };
        const completed = await registerOrResume({
            publicClient: client as never,
            walletClient: secondWallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
            storage,
        }, saved);

        expect(storage.publish).toHaveBeenCalledTimes(1);
        expect(secondWallet.writeContract).toHaveBeenCalledTimes(1);
        expect(completed.stage).toBe("uri-set");
        expect(completed.agentURI).toBe(uri);
    });
});

describe("HTTP metadata verification", () => {
    it("validates public metadata and includes storage provenance in the result", async () => {
        const agentId = 7n;
        const metadata = buildRegistrationMetadata(CONFIG, agentId, REGISTRY);
        const uri = "https://public.example/v1/objects/container/by_id/object";
        const state: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "uri-set",
            agentId: agentId.toString(),
            owner: OWNER,
            agentURI: uri,
            metadata,
            metadataStorage: {
                backend: "neofs",
                uri,
                containerId: "container",
                objectId: "object",
            },
        };
        const client = {
            readContract: vi.fn().mockImplementation(({ functionName }: { functionName: string }) => {
                if (functionName === "ownerOf" || functionName === "getAgentWallet") return OWNER;
                if (functionName === "tokenURI") return uri;
                throw new Error(`unexpected ${functionName}`);
            }),
        };
        const verification = await verifyOnChain({
            client: client as never,
            registry: REGISTRY,
            state,
            config: CONFIG,
            expectedOwner: OWNER,
            fetchImpl: vi.fn().mockResolvedValue(uploadResponse(metadata)),
        });
        expect(verification.metadataMatches).toBe(true);
        expect(verification.registrationRefMatches).toBe(true);

        const result = buildSecretFreeResult(state, verification);
        expect(result.agentURI).toBe(uri);
        expect(result.metadataStorage).toEqual(state.metadataStorage);
        expect(JSON.stringify(result)).not.toContain(STORAGE_CONFIG.bearerToken);
    });
});
