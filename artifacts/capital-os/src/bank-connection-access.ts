export function bankConnectionAccess(providerAvailable: boolean, consentGranted: boolean) {
  return {
    canCreate: providerAvailable,
    canMatch: providerAvailable && consentGranted,
    canSync: providerAvailable && consentGranted,
    canExport: true,
    canRevoke: consentGranted,
    canDelete: true,
  };
}