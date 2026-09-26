export const HUB_MANIFESTS = [
  {
    id: 'hub-account',
    name: 'Account',
    nameKey: 'hub.pulse.widget.account',
    slot: 'system-hub',
    sizes: ['small', 'large'],
    defaultSize: 'small',
    sizeDims: { small: 40, large: 220 },
    height: 40,
  },
  {
    id: 'hub-theme',
    name: 'Theme Changer',
    nameKey: 'hub.pulse.widget.theme',
    slot: 'system-hub',
    sizes: ['small', 'large'],
    defaultSize: 'small',
    sizeDims: { small: 114, large: 210 },
    height: 46,
  },
  {
    id: 'hub-apps',
    name: 'App Buttons',
    nameKey: 'hub.controls.appButtons',
    slot: 'system-hub',
    sizes: ['small', 'medium', 'large'],
    defaultSize: 'large',
    sizeDims: { small: 280, medium: 340, large: 420 },
    overlayControls: false,
  },
]

export const hubManifest = (id) => HUB_MANIFESTS.find(m => m.id === id)
