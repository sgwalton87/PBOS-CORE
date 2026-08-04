import { ConnectorCapability } from "../contracts/connector-capability";
import { SystemConnector } from "../contracts/system-connector";

export class CapabilityDiscovery {
    discover(connector: SystemConnector, permissionIds: readonly string[]): readonly ConnectorCapability[] {
        if (connector.status !== "ACTIVE" || connector.certification !== "CERTIFIED") return [];
        return connector.capabilities.filter(capability => capability.active &&
            capability.requiredPermissions.every(permission => permissionIds.includes(permission)));
    }
}
