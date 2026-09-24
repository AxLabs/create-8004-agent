import { formatEther } from "viem";
import { NEOX_MIN_PRIORITY_FEE_WEI, NEOX_T4_NATIVE_CURRENCY } from "./constants.js";
function maxBigInt(a, b) {
    return a > b ? a : b;
}
export async function getNeoxFees(client) {
    const [gasPrice, rpcPriority, block] = await Promise.all([
        client.getGasPrice(),
        client.estimateMaxPriorityFeePerGas().catch(async () => {
            const hex = (await client.request({
                method: "eth_maxPriorityFeePerGas",
            }));
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
export function quoteFee(fees, gasEstimate) {
    const estimatedFeeWei = gasEstimate * fees.maxFeePerGas;
    return { ...fees, gasEstimate, estimatedFeeWei };
}
export function formatGas(wei) {
    return `${formatEther(wei)} ${NEOX_T4_NATIVE_CURRENCY.symbol}`;
}
export function formatGwei(wei) {
    return `${Number(wei) / 1e9} gwei`;
}
