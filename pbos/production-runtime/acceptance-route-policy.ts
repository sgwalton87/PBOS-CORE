/** Returns true when a path addresses the application's API namespace. */
export function isApplicationApiRoute(path: string): boolean {
    const pathname = path.trim().split(/[?#]/, 1)[0] ?? "";
    return /^\/api(?:\/|$)/i.test(pathname);
}

/** Browser journeys and startup health checks must target same-origin page routes. */
export function isBrowserPageRoute(path: string): boolean {
    return path.startsWith("/") && !path.startsWith("//") && !isApplicationApiRoute(path);
}
