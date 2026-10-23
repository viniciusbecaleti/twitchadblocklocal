import { setNetworkProtection } from './network-strategy';
import { getSettings } from '../storage/settings';
export async function syncBlocking(): Promise<void> { await setNetworkProtection((await getSettings()).enabled); }
