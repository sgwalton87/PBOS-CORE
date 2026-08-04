import { describe, expect, it } from "vitest";
import { RuntimeInstance } from "../../runtime-deployment";
import {
    ContextBuilder, FeedbackProcessor, IntelligenceRegistry, IntelligenceRequest, IntelligenceResponse,
    PersonalizationEngine, ReasoningEngine, RecommendationEngine
} from "../index";

const instance = {
    instanceId: "instance-001",
    systemId: "system-001",
    lifecycleState: "ACTIVE"
} as unknown as RuntimeInstance;

function request(): IntelligenceRequest {
    const context = new ContextBuilder().build(instance, "actor-001", [{
        sourceId: "knowledge-001",
        sourceType: "KNOWLEDGE",
        approved: true,
        content: { fact: "approved" },
        provenance: ["evidence-001", "knowledge-001"]
    }], { allowed: true, actorId: "actor-001", action: "USE_INTELLIGENCE", reason: "permitted" });
    return {
        requestId: "request-001",
        capabilityId: "recommend",
        requestedBy: "actor-001",
        purpose: "Evaluate possible actions",
        context,
        input: { candidateActions: ["review", "defer"] },
        requestedAt: new Date()
    };
}

describe("PBOS Intelligence Activation Layer", () => {
    it("represents intelligence output with confidence, explanation, and provenance", () => {
        const response: IntelligenceResponse<{ proposal: string }> = {
            responseId: "response-001",
            requestId: "request-001",
            output: { proposal: "review" },
            confidence: 0.8,
            explanation: ["Supported by approved context."],
            provenance: ["knowledge-001"],
            status: "REQUIRES_HUMAN_APPROVAL",
            generatedAt: new Date()
        };
        expect(response.status).toBe("REQUIRES_HUMAN_APPROVAL");
        expect(response.provenance).toEqual(["knowledge-001"]);
    });

    it("defines and discovers versioned intelligence capabilities", () => {
        const registry = new IntelligenceRegistry();
        registry.register({
            capabilityId: "recommend", name: "Recommendation", version: "1.0.0",
            requiredPermission: "USE_INTELLIGENCE", supportedSourceTypes: ["KNOWLEDGE"],
            active: true, metadata: {}
        });
        expect(registry.resolve("recommend")?.version).toBe("1.0.0");
        expect(() => registry.register({
            capabilityId: "recommend", name: "Recommendation", version: "1.0.0",
            requiredPermission: "USE_INTELLIGENCE", supportedSourceTypes: [], active: true, metadata: {}
        })).toThrow("already registered");
    });

    it("builds context only from approved sources and preserves provenance", () => {
        const builder = new ContextBuilder();
        expect(request().context.provenance).toEqual(["evidence-001", "knowledge-001"]);
        expect(() => builder.build(instance, "actor-001", [{
            sourceId: "unapproved", sourceType: "EVIDENCE", approved: false,
            content: {}, provenance: ["unapproved"]
        }], { allowed: true, actorId: "actor-001", action: "USE_INTELLIGENCE", reason: "permitted" })).toThrow("unapproved sources");
        expect(() => builder.build(instance, "actor-001", [], {
            allowed: false, actorId: "actor-001", action: "USE_INTELLIGENCE", reason: "denied"
        })).toThrow("authority boundary");
    });

    it("produces transparent reasoning with source evidence", () => {
        const intelligenceRequest = request();
        const result = new ReasoningEngine().reason(intelligenceRequest);
        expect(result.confidence).toBe(1);
        expect(result.explanation).toContain("No final human decision was made.");
        expect(result.provenance).toEqual(intelligenceRequest.context.provenance);
    });

    it("produces ranked recommendations that require human approval", () => {
        const intelligenceRequest = request();
        const reasoning = new ReasoningEngine().reason(intelligenceRequest);
        const recommendations = new RecommendationEngine().recommend(intelligenceRequest, reasoning);
        expect(recommendations.map(item => item.action)).toEqual(["review", "defer"]);
        expect(recommendations.every(item => item.status === "REQUIRES_HUMAN_APPROVAL")).toBe(true);
        expect(recommendations[0].supportingEvidence).toContain("evidence-001");
    });

    it("personalizes only explicit preferences under consent and authority", () => {
        const engine = new PersonalizationEngine();
        const preferences = {
            actorId: "actor-001",
            explicitPreferences: { density: "compact", inferredRisk: "hidden" },
            allowedPreferenceKeys: ["density"],
            consentGranted: true,
            recordedAt: new Date(),
            provenance: "actor-input"
        };
        const applied = engine.personalize(preferences, {
            allowed: true, actorId: "actor-001", action: "PERSONALIZE", authorityId: "authority", reason: "permitted"
        });
        expect(applied.applied).toEqual({ density: "compact" });
        expect(applied.ignoredKeys).toEqual(["inferredRisk"]);
        expect(engine.personalize(preferences, {
            allowed: false, actorId: "actor-001", action: "PERSONALIZE", reason: "denied"
        }).applied).toEqual({});
    });

    it("captures outcome feedback as auditable evolution signals", () => {
        const feedback = new FeedbackProcessor();
        feedback.capture({
            eventId: "feedback-001", requestId: "request-001", responseId: "response-001",
            actorId: "actor-001", outcome: "ACCEPTED", effectiveness: 0.8,
            provenance: ["recommendation-001"], occurredAt: new Date()
        });
        feedback.capture({
            eventId: "feedback-002", requestId: "request-001", responseId: "response-001",
            actorId: "actor-001", outcome: "REJECTED", effectiveness: 0.4,
            provenance: ["recommendation-001"], occurredAt: new Date()
        });
        const signal = feedback.signal("request-001");
        expect(signal.acceptanceRate).toBe(0.5);
        expect(signal.averageEffectiveness).toBeCloseTo(0.6);
        expect(signal.provenance).toEqual(["recommendation-001"]);
    });
});
