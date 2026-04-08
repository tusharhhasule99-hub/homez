/**
 * One structured line for auth service failures, then the stack when available.
 * `operation` matches the HTTP handler so logs match the request.
 */
export function logAuthServiceError(
    operation: 'login' | 'resendOtp' | 'verify' | 'getUser' | 'submitOnboardingStep',
    step: string,
    origin: string,
    error: unknown,
): void {
    const head = `[app/routes/auth/service.ts] authService.${operation} @ ${step} ← ${origin}`;
    if (error instanceof Error) {
        console.error(`${head}: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
    } else {
        console.error(`${head}:`, error);
    }
}
