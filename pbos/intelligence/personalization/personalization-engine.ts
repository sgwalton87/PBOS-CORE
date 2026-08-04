import { AuthorizationDecision } from "../../kernel";
import { PersonalizationResult, PreferenceModel } from "./preference-model";

export class PersonalizationEngine {
    personalize(preferences: PreferenceModel, authority: AuthorizationDecision): PersonalizationResult {
        if (!preferences.consentGranted || !authority.allowed || authority.actorId !== preferences.actorId) {
            return { applied: {}, ignoredKeys: Object.keys(preferences.explicitPreferences), explanation: ["Personalization denied by consent or authority boundary."] };
        }
        const applied: Record<string, unknown> = {};
        const ignoredKeys: string[] = [];
        for (const [key, value] of Object.entries(preferences.explicitPreferences)) {
            if (preferences.allowedPreferenceKeys.includes(key)) applied[key] = value;
            else ignoredKeys.push(key);
        }
        return {
            applied,
            ignoredKeys,
            explanation: ["Only explicit, consented, and permitted preferences were applied."]
        };
    }
}
