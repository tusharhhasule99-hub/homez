/**
 * One structured line for auth service failures, then the stack when available.
 * `operation` matches the HTTP handler (register / login / verify / onboarding) so logs match the request.
 */
export function logAuthServiceError(
    operation: 'register' | 'login' | 'verify' | 'submitOnboardingStep',
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
