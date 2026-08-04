import { AuthorityMode } from "../autonomous-authority";
import {
    ApplicationStrategy,
    BrandPersonality,
    CapabilityKind,
    CornerStyle,
    DomainKind,
    InterfaceDensity,
    SystemBlueprint,
    SystemBlueprintFactory,
    ThemePreference,
    VisualDirection
} from "../system-blueprint";
import { TerminalIO } from "./terminal-io";

const DOMAINS: readonly DomainKind[] = ["EDUCATION", "HEALTHCARE", "FINANCE", "GOVERNMENT", "LEGACY_PLANNING", "WORKFORCE", "COMMUNITY", "CUSTOM"];
const CAPABILITIES: readonly CapabilityKind[] = ["IDENTITY", "WORKFLOWS", "INTELLIGENCE", "ANALYTICS", "AUTOMATION", "NOTIFICATIONS", "DOCUMENTS", "PAYMENTS", "EVIDENCE", "REPORTING", "INTEGRATIONS"];
const PERSONALITIES: readonly BrandPersonality[] = ["TRUSTWORTHY", "BOLD", "WARM", "PREMIUM", "PROFESSIONAL", "INNOVATIVE", "CALM", "YOUTHFUL", "COMMUNITY_CENTERED"];
const STRATEGIES: readonly ApplicationStrategy[] = ["CREATE_NEW", "CONNECT_EXISTING", "BACKEND_ONLY", "PBOS_INSTANCE_ONLY"];
const AUTONOMY: readonly AuthorityMode[] = ["READ_ONLY", "HUMAN_GATED", "DELEGATED_AUTONOMY"];
const VISUAL: readonly VisualDirection[] = ["PBOS_RECOMMENDED", "EXISTING_BRAND", "GUIDED_CUSTOM", "MARKETPLACE_TEMPLATE"];
const THEMES: readonly ThemePreference[] = ["LIGHT", "DARK", "BOTH"];
const CORNERS: readonly CornerStyle[] = ["SHARP", "SUBTLE", "ROUNDED", "EXPRESSIVE"];
const DENSITIES: readonly InterfaceDensity[] = ["COMPACT", "COMFORTABLE", "SPACIOUS"];

export class SystemIntakeTerminal {
    constructor(
        private readonly factory = new SystemBlueprintFactory(),
        private readonly saveBlueprint?: (blueprint: SystemBlueprint) => void
    ) {}

    async collect(io: TerminalIO): Promise<SystemBlueprint> {
        io.write("");
        io.write("CREATE NEW OPERATING SYSTEM");
        const organizationName = await io.prompt("Organization name: ");
        const systemName = await io.prompt("System name: ");
        const mission = await io.prompt("Mission: ");
        const users = this.csv(await io.prompt("Users (comma separated): "));
        const desiredOutcomes = this.csv(await io.prompt("Desired outcomes (comma separated): "));
        const businessOwner = await io.prompt("Business owner: ");
        const technicalOwner = await io.prompt("Technical owner: ");

        const domain = await this.choose(io, "Choose domain", DOMAINS);
        const capabilities = await this.chooseMany(io, "Choose capabilities", CAPABILITIES);
        const applicationStrategy = await this.choose(io, "Application strategy", STRATEGIES);
        const existingRepository = applicationStrategy === "CONNECT_EXISTING"
            ? await io.prompt("Repository (owner/name): ") : undefined;
        const autonomyMode = await this.choose(io, "Build authority", AUTONOMY);

        io.write("\nDESIGN YOUR APPLICATION");
        const personalities = await this.chooseMany(io, "Brand personality", PERSONALITIES);
        const visualDirection = await this.choose(io, "Visual direction", VISUAL);
        const primaryColor = await io.prompt("Primary color (#RRGGBB, blank for PBOS recommendation): ");
        const secondaryColor = await io.prompt("Secondary color (#RRGGBB, blank for PBOS recommendation): ");
        const accentColor = await io.prompt("Accent color (#RRGGBB, blank for PBOS recommendation): ");
        const theme = await this.choose(io, "Theme", THEMES);
        const cornerStyle = await this.choose(io, "Corner style", CORNERS);
        const density = await this.choose(io, "Interface density", DENSITIES);

        const blueprint = this.factory.create({
            organizationName,
            systemName,
            mission,
            users,
            desiredOutcomes,
            domain,
            capabilities,
            applicationStrategy,
            existingRepository,
            autonomyMode,
            businessOwner,
            technicalOwner,
            operatingRegions: this.csv(await io.prompt("Operating regions (comma separated): ")),
            dataClassifications: this.csv(await io.prompt("Data classifications (comma separated): ")),
            regulatoryFrameworks: this.csv(await io.prompt("Regulatory frameworks (comma separated, blank if undecided): ")),
            brand: {
                personalities,
                visualDirection,
                primaryColor: primaryColor.trim() || undefined,
                secondaryColor: secondaryColor.trim() || undefined,
                accentColor: accentColor.trim() || undefined,
                theme,
                cornerStyle,
                density
            }
        });

        io.write("\nSYSTEM BLUEPRINT REVIEW");
        io.write(`System: ${blueprint.identity.systemName}`);
        io.write(`Proposed ID: ${blueprint.identity.proposedSystemId}`);
        io.write(`PBOS foundation: ${blueprint.foundation.pbosVersion}`);
        io.write(`Domain pack: ${blueprint.foundation.domainPack}@${blueprint.foundation.domainPackVersion}`);
        io.write(`Application: ${blueprint.application.strategy}`);
        io.write(`Autonomy: ${blueprint.governance.autonomyMode}`);
        io.write(`Primary: ${blueprint.design.tokens.colors.primary}`);
        io.write(`Accessibility: ${blueprint.design.accessibility.passed ? "PASS" : "REVIEW REQUIRED"}`);
        io.write(`Blueprint status: ${blueprint.status}`);
        blueprint.unresolvedDecisions.forEach(decision => io.write(`Review: ${decision}`));
        this.saveBlueprint?.(blueprint);
        return blueprint;
    }

    private csv(value: string): string[] {
        return value.split(",").map(item => item.trim()).filter(Boolean);
    }

    private async choose<T extends string>(io: TerminalIO, title: string, options: readonly T[]): Promise<T> {
        io.write(`\n${title}:`);
        options.forEach((option, index) => io.write(`${index + 1}. ${option.replaceAll("_", " ")}`));
        const selected = Number.parseInt((await io.prompt("Selection: ")).trim(), 10) - 1;
        if (!Number.isInteger(selected) || selected < 0 || selected >= options.length) throw new Error(`Invalid ${title.toLowerCase()} selection.`);
        return options[selected];
    }

    private async chooseMany<T extends string>(io: TerminalIO, title: string, options: readonly T[]): Promise<T[]> {
        io.write(`\n${title}:`);
        options.forEach((option, index) => io.write(`${index + 1}. ${option.replaceAll("_", " ")}`));
        const selections = this.csv(await io.prompt("Selections (comma separated): "))
            .map(value => Number.parseInt(value, 10) - 1);
        if (selections.length === 0 || selections.some(index => !Number.isInteger(index) || index < 0 || index >= options.length)) {
            throw new Error(`Invalid ${title.toLowerCase()} selection.`);
        }
        return [...new Set(selections.map(index => options[index]))];
    }
}
