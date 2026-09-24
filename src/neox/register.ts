import type { Address, Hex, PublicClient, TransactionReceipt, WalletClient } from "viem";
import { IDENTITY_REGISTRY_ABI } from "./abi.js";
import { explorerTxUrl } from "./constants.js";
import { decodeRegisteredFromReceipt, decodeURIUpdatedFromReceipt, hasAgentId } from "./events.js";
import { getNeoxFees } from "./fees.js";
import {
    buildRegistrationMetadata,
    parseAgentId,
} from "./metadata.js";
import { formatPreflight, runPreflight } from "./preflight.js";
import {
    hasMinted,
    isComplete,
    persistMinted,
    persistMetadataPublished,
    persistPendingTx,
    persistUriSet,
} from "./state.js";
import type { AgentProjectConfig, RegistrationState } from "./types.js";
import { InlineMetadataStorage } from "./storage/inline.js";
import type { MetadataStorage } from "./storage/types.js";

export interface RegisterDeps {
    publicClient: PublicClient;
    walletClient: WalletClient;
    signer: Address;
    registry: Address;
    projectDir: string;
    config: AgentProjectConfig;
    storage?: MetadataStorage;
}

async function waitForReceipt(
    publicClient: PublicClient,
    hash: Hex
): Promise<TransactionReceipt> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") {
        throw new Error(`Transaction ${hash} reverted`);
    }
    return receipt;
}

export async function reconcilePending(
    deps: RegisterDeps,
    state: RegistrationState
): Promise<RegistrationState> {
    if (!state.pendingTxHash || !state.pendingKind) return state;

    const hash = state.pendingTxHash;
    let receipt: TransactionReceipt | null = null;
    try {
        receipt = await deps.publicClient.getTransactionReceipt({ hash });
    } catch {
        receipt = null;
    }

    if (!receipt) {
        const tx = await deps.publicClient.getTransaction({ hash }).catch(() => null);
        if (tx) {
            receipt = await waitForReceipt(deps.publicClient, hash);
        } else {
            throw new Error(
                `Pending ${state.pendingKind} transaction ${hash} was not found. Inspect the hash on the explorer before retrying.`
            );
        }
    }

    if (receipt.status === "reverted") {
        throw new Error(
            `Pending ${state.pendingKind} transaction ${hash} reverted. Resolve it before retrying.`
        );
    }

    if (state.pendingKind === "register") {
        const registered = decodeRegisteredFromReceipt(receipt, deps.registry);
        return persistMinted(deps.projectDir, state, {
            agentId: registered.agentIdDecimal,
            owner: registered.owner,
            receipt,
        });
    }

    const agentId = parseAgentId(state.agentId ?? "0");
    const updated = decodeURIUpdatedFromReceipt(receipt, deps.registry, agentId);
    return persistUriSet(deps.projectDir, state, {
        agentURI: updated.newURI,
        receipt,
        metadata: state.metadata,
    });
}

async function broadcastRegister(deps: RegisterDeps, state: RegistrationState): Promise<RegistrationState> {
    const fees = await getNeoxFees(deps.publicClient);
    const hash = await deps.walletClient.writeContract({
        address: deps.registry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "register",
        args: [],
        account: deps.walletClient.account ?? deps.signer,
        chain: deps.walletClient.chain,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
    const pending = persistPendingTx(deps.projectDir, state, "register", hash);
    console.log(`  Broadcast register(): ${hash}`);
    console.log(`  ${explorerTxUrl(hash)}`);
    const receipt = await waitForReceipt(deps.publicClient, hash);
    const registered = decodeRegisteredFromReceipt(receipt, deps.registry);
    console.log(`  Minted agentId ${registered.agentIdDecimal} (agent ID 0 is valid)`);
    return persistMinted(deps.projectDir, pending, {
        agentId: registered.agentIdDecimal,
        owner: registered.owner,
        receipt,
    });
}

async function broadcastSetUri(
    deps: RegisterDeps,
    state: RegistrationState
): Promise<RegistrationState> {
    if (!hasAgentId(state.agentId)) {
        throw new Error("Cannot publish metadata without a minted agentId");
    }
    const agentId = parseAgentId(state.agentId);
    if (!state.metadata || !state.metadataStorage || !state.agentURI) {
        throw new Error("Cannot set agentURI before metadata has been published");
    }
    const metadata = state.metadata;
    const uri = state.agentURI;
    const fees = await getNeoxFees(deps.publicClient);
    const hash = await deps.walletClient.writeContract({
        address: deps.registry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "setAgentURI",
        args: [agentId, uri],
        account: deps.walletClient.account ?? deps.signer,
        chain: deps.walletClient.chain,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
    const pending = persistPendingTx(deps.projectDir, { ...state, metadata, agentURI: uri }, "setAgentURI", hash);
    console.log(`  Broadcast setAgentURI(${state.agentId}): ${hash}`);
    console.log(`  ${explorerTxUrl(hash)}`);
    const receipt = await waitForReceipt(deps.publicClient, hash);
    decodeURIUpdatedFromReceipt(receipt, deps.registry, agentId);
    return persistUriSet(deps.projectDir, pending, {
        agentURI: uri,
        receipt,
        metadata,
    });
}

export async function registerOrResume(deps: RegisterDeps, state: RegistrationState): Promise<RegistrationState> {
    let current = await reconcilePending(deps, state);

    if (isComplete(current)) {
        console.log(
            `Registration already complete for agentId ${current.agentId}. Refusing to mint another identity.`
        );
        return current;
    }

    if (!hasMinted(current)) {
        const report = await runPreflight({
            client: deps.publicClient,
            registry: deps.registry,
            signer: deps.signer,
            state: current,
        });
        console.log(formatPreflight(report));
        if (report.balanceWei === 0n) {
            throw new Error(
                `Signer ${deps.signer} has 0 GAS on Neo X T4. Fund it before registering.`
            );
        }
        current = await broadcastRegister(deps, current);
    } else {
        console.log(`Resuming metadata publication for agentId ${current.agentId}`);
    }

    if (!isComplete(current)) {
        const agentId = parseAgentId(current.agentId!);
        const metadata = buildRegistrationMetadata(deps.config, agentId, deps.registry);
        if (!current.metadataStorage || !current.agentURI) {
            const storage = deps.storage ?? new InlineMetadataStorage();
            const publication = await storage.publish({
                metadata,
                projectId: deps.config.projectId,
                agentId,
                chainId: current.chainId,
                registry: deps.registry,
            });
            current = persistMetadataPublished(deps.projectDir, current, metadata, publication);
            console.log(`  Published metadata using ${publication.backend}: ${publication.uri}`);
        }

        const report = await runPreflight({
            client: deps.publicClient,
            registry: deps.registry,
            signer: deps.signer,
            state: current,
            uriForEstimate: current.agentURI,
        });
        console.log(formatPreflight(report));
        if (report.balanceWei === 0n) {
            throw new Error(
                `Signer ${deps.signer} has 0 GAS on Neo X T4. Fund it before registering.`
            );
        }
        current = await broadcastSetUri(deps, current);
    }

    return current;
}
