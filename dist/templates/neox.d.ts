/**
 * Neo X T4 templates
 *
 * agent0-sdk does not support Neo X. Generated projects use direct viem calls
 * against the Identity Registry, copying the CLI's self-contained neox library.
 */
import type { WizardAnswers } from "../wizard.js";
import type { CHAINS } from "../config.js";
import { NEOX_T4_IDENTITY_REGISTRY } from "../neox/constants.js";
export { isNeoxChain, NEOX_T4_CHAIN_KEY, NEOX_T4_CHAIN_ID, NEOX_T4_IDENTITY_REGISTRY, } from "../neox/constants.js";
type ChainConfig = (typeof CHAINS)[keyof typeof CHAINS];
export declare function getNeoxIdentityRegistry(): typeof NEOX_T4_IDENTITY_REGISTRY;
export declare function resolveNeoxLibraryDir(): Promise<string>;
export declare function copyNeoxLibrary(projectPath: string): Promise<void>;
export declare function generateNeoxPackageJson(answers: WizardAnswers): string;
export declare function generateNeoxEnvExample(_answers: WizardAnswers, chain: ChainConfig): string;
export declare function generateNeoxAgentConfig(answers: WizardAnswers): string;
export declare function generateNeoxRegisterEntry(): string;
export declare function generateNeoxReadme(answers: WizardAnswers, chain: ChainConfig): string;
export declare function generateNeoxGitignore(): string;
