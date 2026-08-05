import type { ProductBrandSpec } from "../brand-system";
import type { GenesisPortalModel, PortalApplication } from "./contracts";

function escapeHtml(value: string): string {
    return value.replace(/[&<>"]/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"
    })[character] ?? character);
}

function assetUrl(path: string): string {
    return `/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function navigationComponent(): string {
    return `<header class="site-header">
  <a class="factory-lockup" href="#home" aria-label="PBOS Genesis home">
    <span><strong>PBOS</strong><small>GENESIS</small></span>
  </a>
  <nav aria-label="Primary navigation">
    <a href="#platform">Platform</a><a href="#applications">Applications</a><a href="#build">Build</a><a href="#resources">Resources</a>
  </nav>
  <a class="button button-quiet" href="#signin">Sign in</a>
</header>`;
}

export function heroComponent(model: GenesisPortalModel, factoryBrand: ProductBrandSpec): string {
    return `<section class="hero" id="home">
  <div class="hero-copy">
    <p class="eyebrow">${escapeHtml(model.eyebrow)}</p>
    <h1>${escapeHtml(model.title)}</h1>
    <p class="lede">${escapeHtml(model.summary)}</p>
    <div class="actions"><a class="button" href="${escapeHtml(model.primaryAction.href)}">${escapeHtml(model.primaryAction.label)}</a><a class="button button-quiet" href="${escapeHtml(model.secondaryAction.href)}">${escapeHtml(model.secondaryAction.label)}</a></div>
  </div>
  <div class="factory-orbit" aria-label="PBOS Genesis approved brand reference">
    <span class="orbit orbit-one"></span><span class="orbit orbit-two"></span>
    <img class="factory-reference" src="${assetUrl(factoryBrand.logoAsset.sourcePath)}" alt="PBOS Genesis logo">
  </div>
</section>`;
}

export function applicationCardComponent(application: PortalApplication): string {
    const colors = application.brand.colors;
    return `<article class="application-card" style="--app-accent:${colors[3]?.value ?? colors[0].value};--app-surface:${colors[0].value};--app-text:${colors[1]?.value ?? "#fff"}">
  <div class="application-brand">
    <img src="${assetUrl(application.brand.logoAsset.sourcePath)}" alt="${escapeHtml(application.name)} logo" loading="lazy">
  </div>
  <div class="application-copy">
    <p class="eyebrow">PBOS-powered application</p>
    <h3>${escapeHtml(application.name)}</h3>
    <p>${escapeHtml(application.description)}</p>
    <p class="audience">For ${escapeHtml(application.audience)}</p>
    <a href="${escapeHtml(application.href)}">Explore ${escapeHtml(application.name)} <span aria-hidden="true">→</span></a>
  </div>
</article>`;
}

export function applicationsComponent(applications: readonly PortalApplication[]): string {
    return `<section class="applications section" id="applications">
  <p class="eyebrow">Independent identities. One governed foundation.</p>
  <h2>The first applications built by PBOS Genesis</h2>
  <div class="application-grid">${applications.map(applicationCardComponent).join("")}</div>
</section>`;
}

export function factoryStepsComponent(): string {
    const steps = [
        ["01", "Discover", "Define the mission, users, brand, capabilities, and outcomes."],
        ["02", "Configure", "Select the domain pack, authority mode, services, and deployment targets."],
        ["03", "Build", "Generate governed work packages and implement them on protected agent branches."],
        ["04", "Validate", "Collect tests, builds, evidence, lineage, and operator approvals."],
        ["05", "Launch", "Promote only certified releases to web, mobile, and production channels."]
    ];
    return `<section class="section" id="build"><p class="eyebrow">The system factory</p><h2>From mission to certified application</h2><div class="steps">${steps.map(([number, title, description]) => `<article><span>${number}</span><h3>${title}</h3><p>${description}</p></article>`).join("")}</div></section>`;
}

export function footerComponent(): string {
    return `<footer id="resources"><div class="factory-lockup"><span><strong>PBOS</strong><small>GENESIS</small></span></div><p>PBOS Genesis creates operating systems. PBOS v1 powers them. Applications keep their own identity.</p><p>© 2026 PBOS Genesis</p></footer>`;
}
