/*
===============================================================================

PBOS Discovery Session Manager

Classification

Session Management

Authority

PBS-DSC

===============================================================================

Purpose

The Session Manager governs the lifecycle of Discovery Sessions.

It SHALL create, retrieve, update, and archive constitutional discovery
sessions.

Exactly one active Discovery Session SHALL exist per organization.

===============================================================================

Responsibilities

• create sessions

• load sessions

• persist sessions

• archive sessions

• preserve constitutional lineage

===============================================================================
*/

import { DiscoverySession } from "../types/discovery-session";

export class DiscoverySessionManager {

    async create(): Promise<DiscoverySession> {

        throw new Error(
            "Discovery Session creation not implemented."
        );

    }

    async load() {

        throw new Error(
            "Discovery Session loading not implemented."
        );

    }

    async save() {

        throw new Error(
            "Discovery Session persistence not implemented."
        );

    }

    async archive() {

        throw new Error(
            "Discovery Session archival not implemented."
        );

    }

}
