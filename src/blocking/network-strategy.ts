/** Conservative DNR rules: only known third-party display-ad endpoints, never HLS/CDN media. */
export const NETWORK_RULES: chrome.declarativeNetRequest.Rule[] = [
  { id: 1, priority: 1, action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK }, condition: { urlFilter: '||amazon-adsystem.com/', resourceTypes: [chrome.declarativeNetRequest.ResourceType.SCRIPT, chrome.declarativeNetRequest.ResourceType.IMAGE, chrome.declarativeNetRequest.ResourceType.SUB_FRAME] } },
  { id: 2, priority: 1, action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK }, condition: { urlFilter: '||securepubads.g.doubleclick.net/', resourceTypes: [chrome.declarativeNetRequest.ResourceType.SCRIPT, chrome.declarativeNetRequest.ResourceType.IMAGE, chrome.declarativeNetRequest.ResourceType.SUB_FRAME] } }
];
export async function setNetworkProtection(enabled: boolean): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: NETWORK_RULES.map((r) => r.id), addRules: enabled ? NETWORK_RULES : [] });
}
