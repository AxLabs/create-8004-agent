import { formatEther, type Address, type PublicClient } from "viem";
import { IDENTITY_REGISTRY_ABI } from "./abi.js";
import {
    assertTestnetWritesAllowed,
    NEOX_T4_CHAIN_ID,
    NEOX_T4_NATIVE_CURRENCY,
} from "./constants.js";
import { formatGas, getNeoxFees, quoteFee } from "./fees.js";
import { parseAgentId } from "./metadata.js";
import { hasMinted, isComplete } from "./state.js";
import type { FeeQuote, PreflightReport, RegistrationState } from "./types.js";

export async function readChainId(client: PublicClient): Promise<number> {
    return client.getChainId();
}

export function assertChainId(actual: number, expected = NEOX_T4_CHAIN_ID): void {
    if (actual !== expected) {
        throw new Error(
            `Wrong chain: eth_chainId returned ${actual}, expected Neo X T4 ${expected}`
        );
    }
}

export async function readRegistryIdentity(
    client: PublicClient,
    registry: Address
): Promise<{ name: string; version: string; bytecodeLength: number }> {
    const bytecode = await client.getBytecode({ address: registry });
    if (!bytecode || bytecode === "0x") {
        throw new Error(`No contract bytecode at identity registry ${registry}`);
    }

    let name: string;
    let version: string;
    try {
        name = (await client.readContract({
            address: registry,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "name",
        })) as string;
        version = (await client.readContract({
            address: registry,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: "getVersion",
        })) as string;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Registry at ${registry} is missing readable Identity Registry methods (name/getVersion): ${message}`
        );
    }

    return {
        name,
        version,
        bytecodeLength: (bytecode.length - 2) / 2,
    };
}

export async function simulateRegister(client: PublicClient, registry: Address, account: Address) {
    return client.simulateContract({
        address: registry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "register",
        args: [],
        account,
    });
}

export async function simulateSetAgentURI(
    client: PublicClient,
    registry: Address,
    account: Address,
    agentId: bigint,
    uri: string
) {
    return client.simulateContract({
        address: registry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "setAgentURI",
        args: [agentId, uri],
        account,
    });
}

export async function estimateRegisterGas(
    client: PublicClient,
    registry: Address,
    account: Address
): Promise<bigint> {
    return client.estimateContractGas({
        address: registry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "register",
        args: [],
        account,
    });
}

export async function estimateSetAgentURIGas(
    client: PublicClient,
    registry: Address,
    account: Address,
    agentId: bigint,
    uri: string
): Promise<bigint> {
    return client.estimateContractGas({
        address: registry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "setAgentURI",
        args: [agentId, uri],
        account,
    });
}

export function nextActionForState(state: RegistrationState): PreflightReport["nextAction"] {
    if (isComplete(state)) return "already-complete";
    if (hasMinted(state)) return "setAgentURI";
    return "register";
}

export async function runPreflight(args: {
    client: PublicClient;
    registry: Address;
    signer: Address;
    state: RegistrationState;
    uriForEstimate?: string;
}): Promise<PreflightReport> {
    const chainId = await readChainId(args.client);
    assertChainId(chainId);
    assertTestnetWritesAllowed(chainId);

    const identity = await readRegistryIdentity(args.client, args.registry);
    const balanceWei = await args.client.getBalance({ address: args.signer });
    const fees = await getNeoxFees(args.client);
    const action = nextActionForState(args.state);

    let gasEstimate = 0n;
    if (action === "register") {
        await simulateRegister(args.client, args.registry, args.signer);
        gasEstimate = await estimateRegisterGas(args.client, args.registry, args.signer);
    } else if (action === "setAgentURI") {
        if (args.state.agentId === undefined) {
            throw new Error("Minted state is missing agentId");
        }
        const agentId = parseAgentId(args.state.agentId);
        const uri = args.uriForEstimate ?? args.state.agentURI ?? "";
        if (!uri) {
            throw new Error("Cannot estimate setAgentURI without a metadata URI");
        }
        await simulateSetAgentURI(args.client, args.registry, args.signer, agentId, uri);
        gasEstimate = await estimateSetAgentURIGas(
            args.client,
            args.registry,
            args.signer,
            agentId,
            uri
        );
    }

    const quoted: FeeQuote = action === "already-complete" ? fees : quoteFee(fees, gasEstimate);
    const estimatedFeeWei = quoted.estimatedFeeWei ?? 0n;

    return {
        chainId,
        registry: args.registry,
        signer: args.signer,
        balanceWei,
        registryName: identity.name,
        registryVersion: identity.version,
        bytecodeLength: identity.bytecodeLength,
        fees: quoted,
        nextAction: action,
        agentId: args.state.agentId,
        estimatedFeeWei,
    };
}

export function formatPreflight(report: PreflightReport): string {
    const lines = [
        "Neo X T4 preflight (read-only)",
        `  Signer:            ${report.signer}`,
        `  Chain ID:          ${report.chainId}`,
        `  Registry:          ${report.registry}`,
        `  Registry name:     ${report.registryName}`,
        `  Registry version:  ${report.registryVersion}`,
        `  Bytecode:          ${report.bytecodeLength} bytes`,
        `  ${NEOX_T4_NATIVE_CURRENCY.symbol} balance:      ${formatEther(report.balanceWei)} ${NEOX_T4_NATIVE_CURRENCY.symbol}`,
        `  Next action:       ${report.nextAction}`,
    ];
    if (report.agentId !== undefined) {
        lines.push(`  Agent ID:          ${report.agentId}`);
    }
    if (report.fees.gasEstimate !== undefined) {
        lines.push(`  Estimated gas:     ${report.fees.gasEstimate.toString(10)}`);
        lines.push(`  Max fee/gas:       ${report.fees.maxFeePerGas.toString(10)} wei`);
        lines.push(`  Priority fee/gas:  ${report.fees.maxPriorityFeePerGas.toString(10)} wei`);
        lines.push(`  Estimated fee:     ${formatGas(report.estimatedFeeWei)}`);
    }
    if (report.balanceWei === 0n) {
        lines.push("  Warning: signer has 0 GAS; writes will fail until the address is funded.");
    }
    return lines.join("\n");
}
