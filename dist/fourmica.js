import chalk from "chalk";
import inquirer from "inquirer";
import { Client, ConfigBuilder } from "@4mica/sdk";
import { parseAbi, parseUnits } from "viem";
import { CHAINS } from "./config.js";
import { isSolanaChain } from "./config-solana.js";
import { hasFeature } from "./wizard.js";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_STABLE_DECIMALS = 6;
const DEFAULT_NATIVE_DECIMALS = 18;
const ERC20_ABI = parseAbi([
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
]);
const FOURMICA_RPC_URLS = {
    "eth-sepolia": "https://ethereum.sepolia.api.4mica.xyz",
    "polygon-amoy": "https://api.4mica.xyz",
};
export async function maybeRegisterWithFourmica(answers) {
    if (!hasFeature(answers, "x402"))
        return;
    if (isSolanaChain(answers.chain))
        return;
    const chainConfig = CHAINS[answers.chain];
    const hasFourmicaProvider = chainConfig.x402Providers?.includes("4mica") ?? false;
    if (!hasFourmicaProvider)
        return;
    const { registerOnFourmica } = await inquirer.prompt([
        {
            type: "confirm",
            name: "registerOnFourmica",
            message: "Register with 4mica now (optional collateral deposit)?",
            default: false,
        },
    ]);
    if (!registerOnFourmica)
        return;
    let privateKey = answers.generatedPrivateKey;
    if (!privateKey) {
        const { walletPrivateKey } = await inquirer.prompt([
            {
                type: "password",
                name: "walletPrivateKey",
                message: "Wallet private key (leave empty to skip):",
                mask: "*",
                validate: (input) => {
                    const trimmed = input.trim();
                    if (trimmed === "")
                        return true;
                    const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
                    return /^[0-9a-fA-F]{64}$/.test(hex) || "Enter a valid 32-byte hex private key";
                },
            },
        ]);
        privateKey = walletPrivateKey?.trim() ?? "";
    }
    if (!privateKey) {
        console.log(chalk.yellow("Skipping 4mica registration (private key required)."));
        return;
    }
    const { depositAsset, depositAmount } = await inquirer.prompt([
        {
            type: "list",
            name: "depositAsset",
            message: "Collateral asset to deposit:",
            choices: [
                { name: "USDC", value: "usdc" },
                { name: "USDT", value: "usdt" },
                { name: "Native token", value: "native" },
            ],
            default: "usdc",
        },
        {
            type: "input",
            name: "depositAmount",
            message: (ans) => `Deposit amount (${DEPOSIT_ASSETS[ans.depositAsset].label}):`,
            default: (ans) => DEPOSIT_ASSETS[ans.depositAsset].defaultAmount,
            validate: (input) => {
                const trimmed = input.trim();
                if (!/^\d+(\.\d+)?$/.test(trimmed)) {
                    return "Enter a positive number";
                }
                const value = Number(trimmed);
                if (!Number.isFinite(value) || value <= 0) {
                    return "Enter a positive number";
                }
                return true;
            },
        },
    ]);
    try {
        const result = await depositFourmicaCollateral({
            chain: answers.chain,
            privateKey,
            asset: depositAsset,
            amount: depositAmount,
        });
        if (result.status === "already_registered") {
            console.log(chalk.green(`4mica collateral already funded (>= ${result.amount} ${result.assetLabel}).`));
            return;
        }
        if (result.status === "insufficient_balance") {
            console.log(chalk.yellow(`Insufficient ${result.assetLabel} balance for 4mica registration.`));
            console.log(chalk.gray(`Add at least ${result.amount} ${result.assetLabel} to ${result.address} and re-run the setup if you want to register.`));
            return;
        }
        console.log(chalk.green("4mica registration deposit submitted."));
        if (result.depositTx) {
            console.log(chalk.gray(`Deposit tx: ${result.depositTx}`));
        }
    }
    catch (error) {
        console.error(chalk.red("4mica registration failed:"), error);
    }
}
const DEPOSIT_ASSETS = {
    usdc: { label: "USDC", defaultAmount: "1", decimals: DEFAULT_STABLE_DECIMALS, erc20: true },
    usdt: { label: "USDT", defaultAmount: "1", decimals: DEFAULT_STABLE_DECIMALS, erc20: true },
    native: { label: "native token", defaultAmount: "0.01", decimals: DEFAULT_NATIVE_DECIMALS, erc20: false },
};
async function depositFourmicaCollateral({ chain, privateKey, asset, amount, }) {
    const chainConfig = CHAINS[chain];
    const rpcUrl = FOURMICA_RPC_URLS[chain];
    if (!rpcUrl) {
        throw new Error(`4mica RPC URL not configured for ${chainConfig.name}`);
    }
    const cfg = new ConfigBuilder()
        .rpcUrl(rpcUrl)
        .walletPrivateKey(normalizePrivateKey(privateKey))
        .build();
    const client = await Client.new(cfg);
    try {
        const address = client.signer.signer.address;
        const resolved = await resolveDepositAsset(client, asset);
        if (!resolved) {
            throw new Error(`${DEPOSIT_ASSETS[asset].label} is not supported on ${chainConfig.name}`);
        }
        const amountBaseUnits = parseUnits(amount, resolved.decimals);
        const existingAssets = await client.user.getUser();
        const current = existingAssets.find((item) => item.asset.toLowerCase() === resolved.assetAddress.toLowerCase());
        if (current && current.collateral >= amountBaseUnits) {
            return {
                status: "already_registered",
                address,
                assetLabel: resolved.label,
                amount,
                collateral: current.collateral,
            };
        }
        const publicClient = client.gateway.publicClient;
        const balance = resolved.erc20Token
            ? (await publicClient.readContract({
                address: resolved.erc20Token,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [address],
            }))
            : await publicClient.getBalance({ address: address });
        if (balance < amountBaseUnits) {
            return {
                status: "insufficient_balance",
                address,
                assetLabel: resolved.label,
                amount,
                balance,
            };
        }
        const approveReceipt = resolved.erc20Token
            ? await client.user.approveErc20(resolved.erc20Token, amountBaseUnits)
            : undefined;
        const depositReceipt = await client.user.deposit(amountBaseUnits, resolved.erc20Token);
        return {
            status: "deposited",
            address,
            assetLabel: resolved.label,
            amount,
            approveTx: approveReceipt?.transactionHash,
            depositTx: depositReceipt?.transactionHash,
        };
    }
    finally {
        await client.aclose();
    }
}
function normalizePrivateKey(value) {
    const trimmed = value.trim();
    if (trimmed.startsWith("0x"))
        return trimmed;
    return `0x${trimmed}`;
}
async function resolveDepositAsset(client, asset) {
    if (asset === "native") {
        return {
            assetKey: "native",
            label: DEPOSIT_ASSETS.native.label,
            assetAddress: ZERO_ADDRESS,
            decimals: DEFAULT_NATIVE_DECIMALS,
        };
    }
    const tokenAddress = asset === "usdc"
        ? await client.gateway.contract.read.USDC()
        : await client.gateway.contract.read.USDT();
    if (!tokenAddress || isZeroAddress(tokenAddress)) {
        return null;
    }
    const decimals = await getErc20Decimals(client.gateway.publicClient, tokenAddress);
    return {
        assetKey: asset,
        label: DEPOSIT_ASSETS[asset].label,
        assetAddress: tokenAddress,
        erc20Token: tokenAddress,
        decimals,
    };
}
function isZeroAddress(address) {
    return /^0x0{40}$/i.test(address);
}
async function getErc20Decimals(publicClient, tokenAddress) {
    try {
        const decimals = (await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "decimals",
        }));
        const value = Number(decimals);
        return Number.isFinite(value) ? value : DEFAULT_STABLE_DECIMALS;
    }
    catch {
        return DEFAULT_STABLE_DECIMALS;
    }
}
