/**
 * Custom Monad registration templates
 *
 * The agent0-sdk doesn't support Monad yet, so we use direct contract calls.
 */
import type { WizardAnswers } from "../wizard.js";
import type { CHAINS } from "../config.js";
type ChainConfig = (typeof CHAINS)[keyof typeof CHAINS];
export declare const MONAD_CONTRACTS: {
    readonly mainnet: {
        readonly identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
        readonly reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
    };
    readonly testnet: {
        readonly identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e";
        readonly reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713";
    };
};
export declare function isMonadChain(chain: string): boolean;
export declare function getMonadContracts(chain: string): {
    readonly identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
    readonly reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
} | {
    readonly identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e";
    readonly reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713";
};
export declare function generateMonadPackageJson(answers: WizardAnswers): string;
export declare function generateMonadEnv(answers: WizardAnswers, chain: ChainConfig): string;
export declare function generateMonadRegisterScript(answers: WizardAnswers, chain: ChainConfig): string;
export declare function generateMonadReadme(answers: WizardAnswers, chain: ChainConfig): string;
export {};
