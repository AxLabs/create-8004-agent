import type { RegistrationState, SecretFreeRegistrationResult, VerificationResult } from "./types.js";
export declare function buildSecretFreeResult(state: RegistrationState, verification: VerificationResult): SecretFreeRegistrationResult;
export declare function writeSecretFreeResult(projectDir: string, result: SecretFreeRegistrationResult): string;
