import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import { IDENTITY_REGISTRY_ABI } from "../src/neox/abi.js";
import { NEOX_T4_IDENTITY_REGISTRY } from "../src/neox/constants.js";
import {
    buildRegistrationMetadata,
    decodeMetadataDataUri,
    encodeMetadataDataUri,
} from "../src/neox/metadata.js";
import { reconcilePending, registerOrResume } from "../src/neox/register.js";
import { buildSecretFreeResult } from "../src/neox/result.js";
import { emptyState, saveState } from "../src/neox/state.js";
import {
    NeofsMetadataStorage,
    validateNeofsStorageConfig,
} from "../src/neox/storage/neofs.js";
import {
    createMetadataStorage,
    metadataBackend,
} from "../src/neox/storage/index.js";
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
    services: [
        {
            name: "A2A",
            endpoint: "https://a.example/.well-known/agent-card.json",
            version: "0.3.0",
        },
        {
            name: "MCP",
            endpoint: "https://a.example/mcp",
            version: "2025-06-18",
        },
        {
            name: "OASF",
            endpoint: "https://github.com/8004-org/oasf",
            skills: ["natural_language_processing/text_generation"],
            domains: ["technology/software_engineering"],
        },
    ],
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
        expect(JSON.parse(request.body as string).services).toEqual(CONFIG.services);
        expect(fetchImpl).toHaveBeenNthCalledWith(
            2,
            publication.uri,
            { headers: { accept: "application/json" } }
        );
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

function revertedReceipt(hash = `0x${"1".repeat(64)}` as Hex) {
    return {
        status: "reverted",
        transactionHash: hash,
        blockNumber: 2n,
        blockHash: `0x${"3".repeat(64)}` as Hex,
        logs: [],
    };
}

function registeredReceipt(agentId: bigint) {
    const hash = `0x${"4".repeat(64)}` as Hex;
    return {
        status: "success",
        transactionHash: hash,
        blockNumber: 1n,
        blockHash: `0x${"5".repeat(64)}` as Hex,
        logs: [{
            address: REGISTRY,
            topics: encodeEventTopics({
                abi: IDENTITY_REGISTRY_ABI,
                eventName: "Registered",
                args: { agentId, owner: OWNER },
            }),
            data: encodeAbiParameters([{ type: "string" }], [""]),
            blockNumber: 1n,
            transactionHash: hash,
            blockHash: `0x${"5".repeat(64)}` as Hex,
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
    it("reuses an unchanged NeoFS publication after setAgentURI fails", async () => {
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
        expect(firstWallet.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: "setAgentURI",
                args: [7n, uri],
            })
        );
        expect(secondWallet.writeContract).toHaveBeenCalledTimes(1);
        expect(secondWallet.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: "setAgentURI",
                args: [7n, uri],
            })
        );
        expect(completed.stage).toBe("uri-set");
        expect(completed.agentURI).toBe(uri);
    });

    it("replaces a stale NeoFS publication when services change", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "neofs-services-resume-"));
        const configB: AgentProjectConfig = {
            ...CONFIG,
            services: CONFIG.services?.map((service) =>
                service.name === "A2A"
                    ? {
                        ...service,
                        endpoint: "https://b.example/.well-known/agent-card.json",
                    }
                    : service
            ),
        };
        const metadataA = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const metadataB = buildRegistrationMetadata(configB, 7n, REGISTRY);
        const oldUri = "https://public.example/v1/objects/container-123/by_id/object-old";
        const newUri = "https://public.example/v1/objects/container-123/by_id/object-new";
        const minted: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "minted",
            agentId: "7",
            owner: OWNER,
            agentURI: oldUri,
            metadata: metadataA,
            metadataStorage: {
                backend: "neofs",
                uri: oldUri,
                containerId: "container-123",
                objectId: "object-old",
            },
        };
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(uploadResponse({
                container_id: "container-123",
                object_id: "object-new",
            }))
            .mockResolvedValueOnce(uploadResponse(metadataB));
        const storage = new NeofsMetadataStorage(STORAGE_CONFIG, fetchImpl);
        const client = publicClient(newUri);
        const wallet = {
            writeContract: vi.fn().mockResolvedValue(`0x${"2".repeat(64)}` as Hex),
            account: undefined,
            chain: undefined,
        };

        const completed = await registerOrResume({
            publicClient: client as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: configB,
            storage,
        }, minted);

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        const uploadRequest = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        expect(JSON.parse(uploadRequest.body as string)).toEqual(metadataB);
        expect(JSON.parse(uploadRequest.body as string).services).toEqual(configB.services);
        expect(wallet.writeContract).toHaveBeenCalledTimes(1);
        expect(wallet.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: "setAgentURI",
                args: [7n, newUri],
            })
        );
        expect(client.simulateContract).toHaveBeenCalledWith(
            expect.objectContaining({ args: [7n, newUri] })
        );
        expect(client.estimateContractGas).toHaveBeenCalledWith(
            expect.objectContaining({ args: [7n, newUri] })
        );
        expect(completed.agentId).toBe("7");
        expect(completed.agentURI).toBe(newUri);
        expect(completed.metadata).toEqual(metadataB);
        expect(completed.metadataStorage).toEqual({
            backend: "neofs",
            uri: newUri,
            containerId: "container-123",
            objectId: "object-new",
        });

        const saved = JSON.parse(
            fs.readFileSync(path.join(projectDir, ".registration-state.json"), "utf8")
        ) as RegistrationState;
        expect(saved.agentURI).toBe(newUri);
        expect(saved.metadata).toEqual(metadataB);
        expect(saved.metadataStorage).toEqual(completed.metadataStorage);
    });

    it("fails explicitly instead of falling back inline when NeoFS storage is omitted", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "neofs-missing-storage-"));
        const metadataA = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const oldUri = "https://public.example/v1/objects/container-123/by_id/object-old";
        const minted: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "minted",
            agentId: "7",
            owner: OWNER,
            agentURI: oldUri,
            metadata: metadataA,
            metadataStorage: {
                backend: "neofs",
                uri: oldUri,
                containerId: "container-123",
                objectId: "object-old",
            },
        };
        const configB: AgentProjectConfig = {
            ...CONFIG,
            services: CONFIG.services?.map((service) =>
                service.name === "A2A"
                    ? { ...service, endpoint: "https://b.example/.well-known/agent-card.json" }
                    : service
            ),
        };
        const wallet = { writeContract: vi.fn() };

        await expect(registerOrResume({
            publicClient: {} as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: configB,
        }, minted)).rejects.toThrow(/NeoFS metadata storage dependency is required/);
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("uses inline after the documented metadataStorage config change", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "documented-inline-fallback-"));
        const inlineConfig: AgentProjectConfig = {
            ...CONFIG,
            metadataStorage: "inline",
        };
        expect(metadataBackend(inlineConfig)).toBe("inline");
        expect(createMetadataStorage(inlineConfig).backend).toBe("inline");
        const metadata = buildRegistrationMetadata(inlineConfig, 7n, REGISTRY);
        const uri = encodeMetadataDataUri(metadata);
        const oldUri = "https://public.example/v1/objects/container/by_id/object-neofs";
        const minted: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "minted",
            agentId: "7",
            owner: OWNER,
            agentURI: oldUri,
            metadata,
            metadataStorage: {
                backend: "neofs",
                uri: oldUri,
                containerId: "container",
                objectId: "object-neofs",
            },
        };
        const client = publicClient(uri);
        const wallet = {
            writeContract: vi.fn().mockResolvedValue(`0x${"2".repeat(64)}` as Hex),
            account: undefined,
            chain: undefined,
        };

        const completed = await registerOrResume({
            publicClient: client as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: inlineConfig,
        }, minted);

        expect(wallet.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({ args: [7n, uri] })
        );
        expect(client.simulateContract).toHaveBeenCalledWith(
            expect.objectContaining({ args: [7n, uri] })
        );
        expect(client.estimateContractGas).toHaveBeenCalledWith(
            expect.objectContaining({ args: [7n, uri] })
        );
        expect(completed.agentId).toBe("7");
        expect(completed.agentURI).toBe(uri);
        expect(completed.metadataStorage).toEqual({
            backend: "inline",
            uri,
        });
    });

    it("republishes inline metadata through NeoFS when the configured backend changes", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "inline-to-neofs-"));
        const metadata = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const oldUri = encodeMetadataDataUri(metadata);
        const newUri = "https://public.example/v1/objects/container/by_id/object-neofs";
        const minted: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "minted",
            agentId: "7",
            owner: OWNER,
            agentURI: oldUri,
            metadata,
            metadataStorage: { backend: "inline", uri: oldUri },
        };
        const storage: MetadataStorage = {
            backend: "neofs",
            publish: vi.fn().mockResolvedValue({
                backend: "neofs",
                uri: newUri,
                containerId: "container",
                objectId: "object-neofs",
            }),
        };
        const client = publicClient(newUri);
        const wallet = {
            writeContract: vi.fn().mockResolvedValue(`0x${"2".repeat(64)}` as Hex),
            account: undefined,
            chain: undefined,
        };

        const completed = await registerOrResume({
            publicClient: client as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
            storage,
        }, minted);

        expect(storage.publish).toHaveBeenCalledTimes(1);
        expect(storage.publish).toHaveBeenCalledWith(
            expect.objectContaining({ metadata, agentId: 7n })
        );
        expect(wallet.writeContract).toHaveBeenCalledTimes(1);
        expect(wallet.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: "setAgentURI",
                args: [7n, newUri],
            })
        );
        expect(client.simulateContract).toHaveBeenCalledWith(
            expect.objectContaining({ args: [7n, newUri] })
        );
        expect(client.estimateContractGas).toHaveBeenCalledWith(
            expect.objectContaining({ args: [7n, newUri] })
        );
        expect(completed.agentId).toBe("7");
        expect(completed.agentURI).toBe(newUri);
        expect(completed.metadataStorage).toEqual({
            backend: "neofs",
            uri: newUri,
            containerId: "container",
            objectId: "object-neofs",
        });
    });

    it("replaces a stale inline publication when services change", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "inline-services-resume-"));
        const configB: AgentProjectConfig = {
            ...CONFIG,
            metadataStorage: "inline",
            services: CONFIG.services?.map((service) =>
                service.name === "MCP"
                    ? { ...service, endpoint: "https://b.example/mcp" }
                    : service
            ),
        };
        const metadataA = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const metadataB = buildRegistrationMetadata(configB, 7n, REGISTRY);
        const oldUri = encodeMetadataDataUri(metadataA);
        const newUri = encodeMetadataDataUri(metadataB);
        const minted: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "minted",
            agentId: "7",
            owner: OWNER,
            agentURI: oldUri,
            metadata: metadataA,
            metadataStorage: { backend: "inline", uri: oldUri },
        };
        const client = publicClient(newUri);
        const wallet = {
            writeContract: vi.fn().mockResolvedValue(`0x${"2".repeat(64)}` as Hex),
            account: undefined,
            chain: undefined,
        };

        const completed = await registerOrResume({
            publicClient: client as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: configB,
        }, minted);

        expect(wallet.writeContract).toHaveBeenCalledTimes(1);
        expect(wallet.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: "setAgentURI",
                args: [7n, newUri],
            })
        );
        expect(completed.agentId).toBe("7");
        expect(completed.agentURI).not.toBe(oldUri);
        expect(completed.metadataStorage).toEqual({
            backend: "inline",
            uri: newUri,
        });
        expect(decodeMetadataDataUri(completed.agentURI!)).toEqual(metadataB);
        expect(decodeMetadataDataUri(completed.agentURI!).services).toEqual(configB.services);
    });

    it("clears a reverted pending register and permits a safe mint retry", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-register-reverted-"));
        const failedHash = `0x${"1".repeat(64)}` as Hex;
        const pending: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "register-broadcast",
            registerTxHash: failedHash,
            pendingKind: "register",
            pendingTxHash: failedHash,
        };
        saveState(projectDir, pending);
        const recovered = await reconcilePending({
            publicClient: {
                getTransactionReceipt: vi.fn().mockResolvedValue(revertedReceipt(failedHash)),
            } as never,
            walletClient: {} as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
        }, pending);

        expect(recovered.stage).toBe("not-started");
        expect(recovered.agentId).toBeUndefined();
        expect(recovered.pendingKind).toBeUndefined();
        expect(recovered.pendingTxHash).toBeUndefined();
        const recoveredOnDisk = JSON.parse(
            fs.readFileSync(path.join(projectDir, ".registration-state.json"), "utf8")
        ) as RegistrationState;
        expect(recoveredOnDisk.pendingTxHash).toBeUndefined();

        const uri = "https://public.example/v1/objects/container/by_id/object-after-register";
        const client = {
            ...publicClient(uri),
            waitForTransactionReceipt: vi.fn()
                .mockResolvedValueOnce(registeredReceipt(7n))
                .mockResolvedValueOnce(uriUpdatedReceipt(uri)),
        };
        const wallet = {
            writeContract: vi.fn()
                .mockResolvedValueOnce(`0x${"4".repeat(64)}` as Hex)
                .mockResolvedValueOnce(`0x${"2".repeat(64)}` as Hex),
            account: undefined,
            chain: undefined,
        };
        const storage: MetadataStorage = {
            backend: "neofs",
            publish: vi.fn().mockResolvedValue({
                backend: "neofs",
                uri,
                containerId: "container",
                objectId: "object-after-register",
            }),
        };

        const completed = await registerOrResume({
            publicClient: client as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
            storage,
        }, recovered);

        expect(wallet.writeContract).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ functionName: "register", args: [] })
        );
        expect(completed.agentId).toBe("7");
        expect(completed.stage).toBe("uri-set");
    });

    it("clears a reverted pending setAgentURI and retries without reminting", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-uri-reverted-"));
        const uri = "https://public.example/v1/objects/container/by_id/object-a";
        const metadata = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const failedHash = `0x${"1".repeat(64)}` as Hex;
        const pending: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "set-uri-broadcast",
            agentId: "7",
            owner: OWNER,
            agentURI: uri,
            metadata,
            metadataStorage: {
                backend: "neofs",
                uri,
                containerId: "container",
                objectId: "object-a",
            },
            setUriTxHash: failedHash,
            pendingKind: "setAgentURI",
            pendingTxHash: failedHash,
        };
        const storage: MetadataStorage = {
            backend: "neofs",
            publish: vi.fn(),
        };
        const client = {
            ...publicClient(uri),
            getTransactionReceipt: vi.fn().mockResolvedValue(revertedReceipt(failedHash)),
        };
        const wallet = {
            writeContract: vi.fn().mockResolvedValue(`0x${"2".repeat(64)}` as Hex),
            account: undefined,
            chain: undefined,
        };

        const completed = await registerOrResume({
            publicClient: client as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
            storage,
        }, pending);

        expect(storage.publish).not.toHaveBeenCalled();
        expect(wallet.writeContract).toHaveBeenCalledTimes(1);
        expect(wallet.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: "setAgentURI",
                args: [7n, uri],
            })
        );
        expect(completed.agentId).toBe("7");
        expect(completed.pendingTxHash).toBeUndefined();
    });

    it("reapplies freshness after a stale pending setAgentURI reverts", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-uri-reverted-stale-"));
        const configB: AgentProjectConfig = {
            ...CONFIG,
            services: CONFIG.services?.map((service) =>
                service.name === "A2A"
                    ? { ...service, endpoint: "https://b.example/.well-known/agent-card.json" }
                    : service
            ),
        };
        const metadataA = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const metadataB = buildRegistrationMetadata(configB, 7n, REGISTRY);
        const uriA = "https://public.example/v1/objects/container/by_id/object-a";
        const uriB = "https://public.example/v1/objects/container/by_id/object-b";
        const failedHash = `0x${"1".repeat(64)}` as Hex;
        const pending: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "set-uri-broadcast",
            agentId: "7",
            owner: OWNER,
            agentURI: uriA,
            metadata: metadataA,
            metadataStorage: {
                backend: "neofs",
                uri: uriA,
                containerId: "container",
                objectId: "object-a",
            },
            pendingKind: "setAgentURI",
            pendingTxHash: failedHash,
        };
        const storage: MetadataStorage = {
            backend: "neofs",
            publish: vi.fn().mockResolvedValue({
                backend: "neofs",
                uri: uriB,
                containerId: "container",
                objectId: "object-b",
            }),
        };
        const client = {
            ...publicClient(uriB),
            getTransactionReceipt: vi.fn().mockResolvedValue(revertedReceipt(failedHash)),
        };
        const wallet = {
            writeContract: vi.fn().mockResolvedValue(`0x${"2".repeat(64)}` as Hex),
            account: undefined,
            chain: undefined,
        };

        const completed = await registerOrResume({
            publicClient: client as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: configB,
            storage,
        }, pending);

        expect(storage.publish).toHaveBeenCalledWith(
            expect.objectContaining({ metadata: metadataB })
        );
        expect(wallet.writeContract).toHaveBeenCalledTimes(1);
        expect(wallet.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: "setAgentURI",
                args: [7n, uriB],
            })
        );
        expect(completed.metadata).toEqual(metadataB);
        expect(completed.agentURI).toBe(uriB);
    });

    it("preserves an unknown pending hash and sends no replacement transaction", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-uri-unknown-"));
        const uri = "https://public.example/v1/objects/container/by_id/object-a";
        const metadata = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const pendingHash = `0x${"1".repeat(64)}` as Hex;
        const pending: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "set-uri-broadcast",
            agentId: "7",
            owner: OWNER,
            agentURI: uri,
            metadata,
            metadataStorage: {
                backend: "neofs",
                uri,
                containerId: "container",
                objectId: "object-a",
            },
            pendingKind: "setAgentURI",
            pendingTxHash: pendingHash,
        };
        saveState(projectDir, pending);
        const storage: MetadataStorage = {
            backend: "neofs",
            publish: vi.fn(),
        };
        const wallet = { writeContract: vi.fn() };

        await expect(registerOrResume({
            publicClient: {
                getTransactionReceipt: vi.fn().mockRejectedValue(new Error("not found")),
                getTransaction: vi.fn().mockResolvedValue(null),
            } as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
            storage,
        }, pending)).rejects.toThrow(/was not found.*explorer/i);

        const saved = JSON.parse(
            fs.readFileSync(path.join(projectDir, ".registration-state.json"), "utf8")
        ) as RegistrationState;
        expect(saved.pendingKind).toBe("setAgentURI");
        expect(saved.pendingTxHash).toBe(pendingHash);
        expect(storage.publish).not.toHaveBeenCalled();
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("completes a confirmed pending setAgentURI when metadata is unchanged", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-uri-unchanged-"));
        const uri = "https://public.example/v1/objects/container/by_id/object-a";
        const metadata = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const pending: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "set-uri-broadcast",
            agentId: "7",
            owner: OWNER,
            agentURI: uri,
            metadata,
            metadataStorage: {
                backend: "neofs",
                uri,
                containerId: "container",
                objectId: "object-a",
            },
            pendingKind: "setAgentURI",
            pendingTxHash: `0x${"1".repeat(64)}` as Hex,
        };
        const storage: MetadataStorage = {
            backend: "neofs",
            publish: vi.fn(),
        };
        const client = {
            ...publicClient(uri),
            getTransactionReceipt: vi.fn().mockResolvedValue(uriUpdatedReceipt(uri)),
        };
        const wallet = { writeContract: vi.fn() };

        const completed = await registerOrResume({
            publicClient: client as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
            storage,
        }, pending);

        expect(completed.stage).toBe("uri-set");
        expect(completed.agentURI).toBe(uri);
        expect(storage.publish).not.toHaveBeenCalled();
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("refreshes metadata after a stale pending setAgentURI confirms", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-uri-stale-"));
        const configB: AgentProjectConfig = {
            ...CONFIG,
            services: CONFIG.services?.map((service) =>
                service.name === "MCP"
                    ? { ...service, endpoint: "https://b.example/mcp" }
                    : service
            ),
        };
        const metadataA = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const metadataB = buildRegistrationMetadata(configB, 7n, REGISTRY);
        const uriA = "https://public.example/v1/objects/container/by_id/object-a";
        const uriB = "https://public.example/v1/objects/container/by_id/object-b";
        const pending: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "set-uri-broadcast",
            agentId: "7",
            owner: OWNER,
            agentURI: uriA,
            metadata: metadataA,
            metadataStorage: {
                backend: "neofs",
                uri: uriA,
                containerId: "container",
                objectId: "object-a",
            },
            pendingKind: "setAgentURI",
            pendingTxHash: `0x${"1".repeat(64)}` as Hex,
        };
        const storage: MetadataStorage = {
            backend: "neofs",
            publish: vi.fn().mockResolvedValue({
                backend: "neofs",
                uri: uriB,
                containerId: "container",
                objectId: "object-b",
            }),
        };
        const client = {
            ...publicClient(uriB),
            getTransactionReceipt: vi.fn().mockResolvedValue(uriUpdatedReceipt(uriA)),
        };
        const wallet = {
            writeContract: vi.fn().mockResolvedValue(`0x${"2".repeat(64)}` as Hex),
            account: undefined,
            chain: undefined,
        };

        const completed = await registerOrResume({
            publicClient: client as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: configB,
            storage,
        }, pending);

        expect(storage.publish).toHaveBeenCalledTimes(1);
        expect(storage.publish).toHaveBeenCalledWith(
            expect.objectContaining({ metadata: metadataB, agentId: 7n })
        );
        expect(wallet.writeContract).toHaveBeenCalledTimes(1);
        expect(wallet.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: "setAgentURI",
                args: [7n, uriB],
            })
        );
        expect(completed.agentId).toBe("7");
        expect(completed.stage).toBe("uri-set");
        expect(completed.agentURI).toBe(uriB);
        expect(completed.metadata).toEqual(metadataB);
    });

    it("waits for a genuinely pending setAgentURI without broadcasting a duplicate", async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-uri-wait-"));
        const uri = "https://public.example/v1/objects/container/by_id/object-a";
        const metadata = buildRegistrationMetadata(CONFIG, 7n, REGISTRY);
        const pendingHash = `0x${"1".repeat(64)}` as Hex;
        const pending: RegistrationState = {
            ...emptyState(CONFIG.projectId),
            stage: "set-uri-broadcast",
            agentId: "7",
            owner: OWNER,
            agentURI: uri,
            metadata,
            metadataStorage: {
                backend: "neofs",
                uri,
                containerId: "container",
                objectId: "object-a",
            },
            pendingKind: "setAgentURI",
            pendingTxHash: pendingHash,
        };
        let resolveReceipt!: (receipt: ReturnType<typeof uriUpdatedReceipt>) => void;
        const waitForTransactionReceipt = vi.fn().mockReturnValue(
            new Promise<ReturnType<typeof uriUpdatedReceipt>>((resolve) => {
                resolveReceipt = resolve;
            })
        );
        const client = {
            ...publicClient(uri),
            getTransactionReceipt: vi.fn().mockRejectedValue(new Error("not mined")),
            getTransaction: vi.fn().mockResolvedValue({ hash: pendingHash }),
            waitForTransactionReceipt,
        };
        const storage: MetadataStorage = {
            backend: "neofs",
            publish: vi.fn(),
        };
        const wallet = { writeContract: vi.fn() };

        const resultPromise = registerOrResume({
            publicClient: client as never,
            walletClient: wallet as never,
            signer: OWNER,
            registry: REGISTRY,
            projectDir,
            config: CONFIG,
            storage,
        }, pending);

        await vi.waitFor(() => expect(waitForTransactionReceipt).toHaveBeenCalledWith({
            hash: pendingHash,
        }));
        expect(storage.publish).not.toHaveBeenCalled();
        expect(wallet.writeContract).not.toHaveBeenCalled();

        resolveReceipt(uriUpdatedReceipt(uri));
        const completed = await resultPromise;
        expect(completed.stage).toBe("uri-set");
        expect(wallet.writeContract).not.toHaveBeenCalled();
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
