import { formatEther, type PublicClient } from "viem";
import { NEOX_MIN_PRIORITY_FEE_WEI, NEOX_T4_NATIVE_CURRENCY } from "./constants.js";
import type { FeeQuote } from "./types.js";

function maxBigInt(a: bigint, b: bigint): bigint {
    return a > b ? a : b;
}

export async function getNeoxFees(client: PublicClient): Promise<FeeQuote> {
    const [gasPrice, rpcPriority, block] = await Promise.all([
        client.getGasPrice(),
        client.estimateMaxPriorityFeePerGas().catch(async () => {
            const hex = (await client.request({
                method: "eth_maxPriorityFeePerGas",
            })) as `0x${string}`;
            return BigInt(hex);
        }),
        client.getBlock({ blockTag: "latest" }),
    ]);

    const baseFee = block.baseFeePerGas ?? 0n;
    const maxPriorityFeePerGas = maxBigInt(rpcPriority, NEOX_MIN_PRIORITY_FEE_WEI);
    const maxFeePerGas = maxBigInt(gasPrice, baseFee + maxPriorityFeePerGas);

    return {
        gasPrice,
        baseFee,
        maxPriorityFeePerGas,
        maxFeePerGas,
    };
}

export function quoteFee(fees: FeeQuote, gasEstimate: bigint): FeeQuote {
    const estimatedFeeWei = gasEstimate * fees.maxFeePerGas;
    return { ...fees, gasEstimate, estimatedFeeWei };
}

export function formatGas(wei: bigint): string {
    return `${formatEther(wei)} ${NEOX_T4_NATIVE_CURRENCY.symbol}`;
}

export function formatGwei(wei: bigint): string {
    return `${Number(wei) / 1e9} gwei`;
}
