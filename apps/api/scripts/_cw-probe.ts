import { CampaignWatchService } from '../src/services/campaign-watch.service.js';
const snap = await CampaignWatchService.getSnapshot();
console.log(JSON.stringify(snap, null, 2));
process.exit(0);
