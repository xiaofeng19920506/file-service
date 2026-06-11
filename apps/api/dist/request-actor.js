import { getRequestActorLabel } from './auth.js';
export function resolveRequestActor(opts) {
    return getRequestActorLabel(opts.request, opts.sessionSecret, opts.apiKeyConfig);
}
//# sourceMappingURL=request-actor.js.map