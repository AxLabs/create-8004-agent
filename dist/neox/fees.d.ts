import { type PublicClient } from "viem";
import type { FeeQuote } from "./types.js";
export declare function getNeoxFees(client: PublicClient): Promise<FeeQuote>;
export declare function quoteFee(fees: FeeQuote, gasEstimate: bigint): FeeQuote;
export declare function formatGas(wei: bigint): string;
export declare function formatGwei(wei: bigint): string;
