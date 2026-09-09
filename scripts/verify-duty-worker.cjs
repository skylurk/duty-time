// Read-only production verification. No deployments, document writes, or emails.
const root = '/usr/local/lib/node_modules/firebase-tools/lib/';
const { configstore } = require(root + 'configstore');
async function main() {
  await require(root + 'requireAuth').requireAuth({ project: 'kasas-1-0', user: configstore.get('user'), tokens: configstore.get('tokens'), nonInteractive: true });
  const { Client } = require(root + 'apiv2');
  const fn = await new Client({ urlPrefix: 'https://cloudfunctions.googleapis.com', apiVersion: 'v2' }).get('/projects/kasas-1-0/locations/europe-west1/functions/dutyTimeAutoCheckout');
  console.log(JSON.stringify({ function: fn.body.name, state: fn.body.state, updated: fn.body.updateTime }));
  const job = await new Client({ urlPrefix: 'https://cloudscheduler.googleapis.com', apiVersion: 'v1' }).get('/projects/kasas-1-0/locations/europe-west1/jobs/firebase-schedule-dutyTimeAutoCheckout-europe-west1');
  console.log(JSON.stringify({ scheduler: job.body.state, schedule: job.body.schedule, lastAttempt: job.body.lastAttemptTime, status: job.body.status }));
  // Logging entries:list is a read operation expressed as POST by Google's API.
  const logs = await new Client({ urlPrefix: 'https://logging.googleapis.com', apiVersion: 'v2' }).post('/entries:list', { resourceNames: ['projects/kasas-1-0'], filter: 'resource.type="cloud_run_revision" AND resource.labels.service_name="dutytimeautocheckout" AND jsonPayload.message="DutyTime cutoff sweep complete"', orderBy: 'timestamp desc', pageSize: 3 });
  console.log(JSON.stringify({ recentRuns: (logs.body.entries || []).map(e => ({ time: e.timestamp, failures: e.jsonPayload?.failures, reportsQueued: e.jsonPayload?.reportsQueued })) }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
