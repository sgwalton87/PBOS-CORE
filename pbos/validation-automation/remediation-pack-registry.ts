import { ProjectRemediationProfile, RemediationPack, RemediationPackContext } from "./remediation-pack";

export class RemediationPackRegistry {
    private readonly packs = new Map<string, RemediationPack>();
    register(pack: RemediationPack): void {
        if (this.packs.has(pack.packId)) throw new Error(`Remediation pack already registered: ${pack.packId}`);
        this.packs.set(pack.packId, pack);
    }
    get(packId: string): RemediationPack | undefined { return this.packs.get(packId); }
    matching(profile: ProjectRemediationProfile, context: RemediationPackContext): readonly RemediationPack[] {
        return profile.remediationPackIds.map(id => {
            const pack = this.packs.get(id);
            if (!pack) throw new Error(`Project ${profile.systemId} references unknown remediation pack: ${id}`);
            return pack;
        }).filter(pack => pack.supports(context));
    }
}

export class ProjectRemediationProfileRegistry {
    private readonly profiles = new Map<string, ProjectRemediationProfile>();
    register(profile: ProjectRemediationProfile): void {
        if (this.profiles.has(profile.systemId)) throw new Error(`Project remediation profile already registered: ${profile.systemId}`);
        this.profiles.set(profile.systemId, profile);
    }
    get(systemId: string): ProjectRemediationProfile | undefined { return this.profiles.get(systemId); }
}
