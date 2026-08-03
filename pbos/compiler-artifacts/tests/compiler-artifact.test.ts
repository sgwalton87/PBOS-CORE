import { describe, expect, it } from "vitest";

import { ArtifactRegistry } from "../registry/artifact-registry";
import { ArtifactValidator } from "../validation/artifact-validator";
import { ArtifactSerializer } from "../serialization/artifact-serializer";
import { ArtifactLineageTracker } from "../lineage/artifact-lineage";
import { ArtifactReporter } from "../reporting/artifact-report";
import { CompilerArtifact } from "../contracts/compiler-artifact";

describe("PBOS Compiler Artifact Model", () => {

    const artifact: CompilerArtifact = {

        id: "artifact-001",

        artifactType: "TEST",

        schemaVersion: "1.0.0",

        compilerVersion: "1.0.0",

        producedBy: "CompilerArtifactTest",

        producedAt: new Date(),

        sessionId: "session-001",

        lineageId: "lineage-001",

        metadata: {}

    };

    it("registers artifacts", () => {

        const registry = new ArtifactRegistry();

        registry.register(artifact);

        expect(registry.count()).toBe(1);

    });

    it("validates artifacts", () => {

        const validator = new ArtifactValidator();

        expect(validator.validate(artifact)).toBe(true);

    });

    it("serializes artifacts", () => {

        const serializer = new ArtifactSerializer();

        expect(serializer.serialize(artifact)).toContain("artifact-001");

    });

    it("deserializes artifacts", () => {

        const serializer = new ArtifactSerializer();

        const restored = serializer.deserialize<CompilerArtifact>(
            serializer.serialize(artifact)
        );

        expect(restored.id).toBe("artifact-001");

    });

    it("creates lineage", () => {

        const tracker = new ArtifactLineageTracker();

        const lineage = tracker.create({

            lineageId: "lineage-001",

            artifactId: artifact.id,

            producedBy: artifact.producedBy,

            compilerStage: "TEST",

            compilerVersion: artifact.compilerVersion,

            producedAt: artifact.producedAt

        });

        expect(lineage.artifactId).toBe(artifact.id);

    });

    it("creates reports", () => {

        const reporter = new ArtifactReporter();

        const report = reporter.create(

            artifact.id,

            artifact.artifactType,

            true

        );

        expect(report.valid).toBe(true);

    });

});
