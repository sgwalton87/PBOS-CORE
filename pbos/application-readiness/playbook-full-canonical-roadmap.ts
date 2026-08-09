export interface PlaybookCanonicalOperatingSystem {
    readonly osId: string;
    readonly label: string;
    readonly route: string;
    readonly authorityPaths: readonly string[];
}

export interface PlaybookCanonicalOnboardingPathway {
    readonly pathwayId: string;
    readonly label: string;
    readonly operatingSystemId: string;
    readonly authorityPaths: readonly string[];
}

const MASTER = "docs/MASTER_CHECKLIST.md";
const ARCHITECTURE = "docs/ARCHITECTURE.md";
const ROLE_REGISTRY = "docs/GOVERNANCE/ROLE_REGISTRY.md";
const SPRINT_MAP = "docs/ONBOARDING_ROLE_OS_SPRINT_MAP.md";
const FUNCTIONAL_AUDIT = "docs/PLATFORM_FUNCTIONAL_AUDIT.md";

/**
 * The complete role-OS boundary recovered from the canonical roadmap corpus.
 * Some OS identities intentionally share a physical route today. Sharing a route
 * does not permit PBOS to collapse their role, authority, onboarding, data, or
 * acceptance contracts.
 */
export const PLAYBOOK_CANONICAL_OPERATING_SYSTEMS: readonly PlaybookCanonicalOperatingSystem[] = [
    { osId: "SCHOLAR", label: "Scholar OS", route: "/dashboard", authorityPaths: [MASTER, ARCHITECTURE, ROLE_REGISTRY] },
    { osId: "SCHOLAR_ATHLETE", label: "Scholar-Athlete OS", route: "/scholar-athlete-os", authorityPaths: [MASTER, ARCHITECTURE, ROLE_REGISTRY] },
    { osId: "PARENT_GUARDIAN", label: "Parent Guardian OS", route: "/family-os", authorityPaths: [MASTER, ARCHITECTURE, ROLE_REGISTRY] },
    { osId: "TEACHER_EDUCATOR", label: "Teacher Educator OS", route: "/educator-os", authorityPaths: [MASTER, ARCHITECTURE, ROLE_REGISTRY] },
    { osId: "HIGH_SCHOOL_COUNSELOR", label: "High School Counselor OS", route: "/educator-os", authorityPaths: [MASTER, ARCHITECTURE, SPRINT_MAP] },
    { osId: "MENTOR", label: "Mentor OS", route: "/mentor-os", authorityPaths: [MASTER, ARCHITECTURE, ROLE_REGISTRY] },
    { osId: "HIGH_SCHOOL_COACH", label: "High School Coach OS", route: "/educator-os", authorityPaths: [MASTER, ARCHITECTURE, ROLE_REGISTRY] },
    { osId: "COLLEGE_COACH_RECRUITER", label: "College Coach Recruiter OS", route: "/university-os", authorityPaths: [MASTER, ARCHITECTURE, ROLE_REGISTRY] },
    { osId: "COLLEGE_ADMISSIONS", label: "College Admissions OS", route: "/university-os", authorityPaths: [MASTER, ARCHITECTURE, ROLE_REGISTRY] },
    { osId: "BRAND_PARTNER", label: "Brand Partner OS", route: "/brand-partner-os", authorityPaths: [MASTER, ARCHITECTURE, ROLE_REGISTRY] },
    { osId: "EMPLOYER", label: "Employer OS", route: "/employer-os", authorityPaths: [MASTER, ARCHITECTURE, ROLE_REGISTRY] },
    { osId: "FOUNDER", label: "Founder OS", route: "/founder", authorityPaths: [MASTER, ARCHITECTURE, FUNCTIONAL_AUDIT] },
    { osId: "ATHLETES_ABROAD", label: "Athletes Abroad Hub", route: "/athlete-abroad-os", authorityPaths: [MASTER, ARCHITECTURE, SPRINT_MAP] },
    { osId: "TRANSITION_AGED_YOUTH", label: "Transition-Aged Youth OS", route: "/dashboard", authorityPaths: [ROLE_REGISTRY, SPRINT_MAP] },
    { osId: "DISTRICT_SCHOOL_ADMIN", label: "District / School Administrator OS", route: "/district-os", authorityPaths: [ROLE_REGISTRY, SPRINT_MAP, FUNCTIONAL_AUDIT] },
    { osId: "COMMUNITY_PARTNER", label: "Community Partner OS", route: "/pending", authorityPaths: [ROLE_REGISTRY, SPRINT_MAP] },
    { osId: "PLATFORM_ADMIN", label: "Platform Administration OS", route: "/admin", authorityPaths: [ARCHITECTURE, FUNCTIONAL_AUDIT] }
];

/** Founder and platform administration are provisioned authorities, not public onboarding. */
export const PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS: readonly PlaybookCanonicalOnboardingPathway[] = [
    ["SCHOLAR", "Scholar onboarding", "SCHOLAR"],
    ["SCHOLAR_ATHLETE", "Scholar-Athlete onboarding", "SCHOLAR_ATHLETE"],
    ["PARENT_GUARDIAN", "Parent / Guardian onboarding", "PARENT_GUARDIAN"],
    ["TEACHER_EDUCATOR", "Teacher / Educator onboarding", "TEACHER_EDUCATOR"],
    ["HIGH_SCHOOL_COUNSELOR", "High School Counselor onboarding", "HIGH_SCHOOL_COUNSELOR"],
    ["MENTOR", "Mentor onboarding", "MENTOR"],
    ["HIGH_SCHOOL_COACH", "High School Coach onboarding", "HIGH_SCHOOL_COACH"],
    ["COLLEGE_COACH_RECRUITER", "College Coach / Recruiter onboarding", "COLLEGE_COACH_RECRUITER"],
    ["COLLEGE_ADMISSIONS", "College Admissions onboarding", "COLLEGE_ADMISSIONS"],
    ["BRAND_PARTNER", "Brand Partner onboarding", "BRAND_PARTNER"],
    ["EMPLOYER", "Employer / Workforce Partner onboarding", "EMPLOYER"],
    ["TRANSITION_AGED_YOUTH", "Transition-Aged Youth onboarding", "TRANSITION_AGED_YOUTH"],
    ["ATHLETES_ABROAD", "Athlete Abroad enrollment", "ATHLETES_ABROAD"],
    ["DISTRICT_SCHOOL_ADMIN", "District / School Administrator onboarding", "DISTRICT_SCHOOL_ADMIN"],
    ["COMMUNITY_PARTNER", "Community Partner onboarding", "COMMUNITY_PARTNER"]
].map(([pathwayId, label, operatingSystemId]) => ({
    pathwayId,
    label,
    operatingSystemId,
    authorityPaths: [MASTER, ROLE_REGISTRY, SPRINT_MAP]
}));

export const PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS: readonly string[] = [
    ...PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.map(item => `ONBOARDING-${item.pathwayId.replaceAll("_", "-")}`),
    ...PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.map(item => `OS-${item.osId.replaceAll("_", "-")}`)
];

const legacyCrossDomainSpecifications: Readonly<Record<string, string>> = {
    "SCHOLAR-ONBOARDING-TO-DASHBOARD": "tests/acceptance/pbos-scholar.spec.ts",
    "TRANSCRIPT-TO-ACADEMIC-READINESS": "tests/acceptance/pbos-academic.spec.ts",
    "READINESS-TO-OPPORTUNITY": "tests/acceptance/pbos-opportunity.spec.ts",
    "OPPORTUNITY-TO-APPLICATION": "tests/acceptance/pbos-application.spec.ts",
    "APPLICATION-TO-AUTHORIZED-SUPPORT": "tests/acceptance/pbos-support.spec.ts",
    "AUTHORIZED-SUPPORT-MESSAGING": "tests/acceptance/pbos-messaging.spec.ts",
    "EVENT-TO-ACKNOWLEDGED-NOTIFICATION": "tests/acceptance/pbos-notifications.spec.ts"
};

export function playbookCanonicalJourneySpecification(journeyId: string): string {
    return legacyCrossDomainSpecifications[journeyId] ??
        `tests/acceptance/pbos-${journeyId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.spec.ts`;
}

export function playbookCanonChecklistItemMissionId(phaseId: string, item: string): string {
    const phase = phaseId.replace(/^PHASE-/i, "").padStart(2, "0");
    const slug = item.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!/^\d{2}$/.test(phase) || !slug) throw new Error(`Invalid canonical checklist item identity: ${phaseId}:${item}.`);
    return `048-phase-${phase}-item-${slug}`;
}

function assertUnique(values: readonly string[], label: string): void {
    const duplicate = values.find((value, index) => values.indexOf(value) !== index);
    if (duplicate) throw new Error(`Playbook canonical roadmap contains duplicate ${label}: ${duplicate}.`);
}

export function assertPlaybookFullCanonicalRoadmap(): void {
    if (PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.length !== 17) {
        throw new Error(`Playbook canonical roadmap requires 17 operating systems; received ${PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.length}.`);
    }
    if (PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.length < 14) {
        throw new Error(`Playbook canonical roadmap requires at least 14 role onboarding pathways; received ${PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.length}.`);
    }
    assertUnique(PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.map(item => item.osId), "OS ID");
    assertUnique(PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.map(item => item.pathwayId), "onboarding pathway ID");
    assertUnique(PLAYBOOK_REQUIRED_CANONICAL_JOURNEY_IDS, "acceptance journey ID");
    const osIds = new Set(PLAYBOOK_CANONICAL_OPERATING_SYSTEMS.map(item => item.osId));
    const orphan = PLAYBOOK_CANONICAL_ONBOARDING_PATHWAYS.find(item => !osIds.has(item.operatingSystemId));
    if (orphan) throw new Error(`Playbook onboarding pathway ${orphan.pathwayId} has no canonical operating system.`);
}
