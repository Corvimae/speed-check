import fetch from 'isomorphic-fetch';
import { uniq } from 'lodash';

export interface NormalizedRunnerData {
  username: string;
  pronouns: string | null;
  twitch?: string | null;
  speedruncom?: string | null;
}

export interface NormalizedEventData {
  source: string;
  name: string;
  runners: NormalizedRunnerData[];
  scheduled: string[] | null;
}


interface ScheduleLine {
  runners: {
    username: string;
  }[];
}

interface OengusSubmitter {
  user: {
    username: string;
    pronouns: string | null;
    connections: {
      platform: string;
      username: string;
    }[];
  };
}

interface HoraroScheduleRow {
  data: string[];
}

interface GDQTrackerRun {
  pk: number;
  fields: {
    order: number | null;
    runners: number[];
  };
}
interface GDQTrackerRunner {
  pk: number;
  fields: {
    name: string;
    stream: string;
    pronouns: string;
  };
}

export async function fetchNormalizedGDQTrackerData(eventUrl: string): Promise<NormalizedEventData> {
  const [trackerUrl, event] = eventUrl.split('/event/');
  const query = Number.isNaN(Number(event)) ? `short=${event}` : `id=${event}`;
  const marathonInfoResponse = await fetch(`${trackerUrl}/search?type=event&${query}`);
  const marathonInfo = await marathonInfoResponse.json();

  if (marathonInfo.length === 0) throw new Error('The event could not be found in the tracker instance.');

  const eventId = marathonInfo[0].pk;

  const runInfoResponse = await fetch(`${trackerUrl}/search?type=run&event=${eventId}`);
  const runInfo: GDQTrackerRun[] = await runInfoResponse.json();

  const runnerInfoResponse = await fetch(`${trackerUrl}/search?type=runner&event=${eventId}`);
  const runnerInfo: GDQTrackerRunner[] = await runnerInfoResponse.json();

  const runnerNameById = runnerInfo.reduce((acc, runner) => ({
    ...acc,
    [runner.pk]: runner.fields.name,
  }), {} as Record<number, string>);

  console.log(uniq(runInfo
    .filter(run => run.fields.order !== null)
    .flatMap(run => run.fields.runners)
    .map(id => runnerNameById[id])
    .filter(name => name !== undefined && name !== null)));
  return {
    source: 'gdqtracker',
    name: marathonInfo[0].fields.name,
    runners: runnerInfo.map(runner => ({
      username: runner.fields.name,
      pronouns: runner.fields.pronouns?.toLowerCase().trim() || null,
      twitch: runner.fields.stream?.replace(/(https?:\/\/?)?(www.)?twitch.tv\//, '').trim() || null,
    })),
    scheduled: uniq(runInfo
      .filter(run => run.fields.order !== null)
      .flatMap(run => run.fields.runners)
      .map(id => runnerNameById[id])
      .filter(name => name !== undefined && name !== null)),
  };
}

const VALID_RUNNER_COLUMNS = ['runner', 'runners', 'runner(s)', 'player', 'players', 'player(s)'];

export async function fetchNormalizedHoraroData(organization: string, event: string): Promise<NormalizedEventData> {
  const marathonInfoResponse = await fetch(`https://horaro.org/${organization}/${event}.json`);
  const marathonInfo = await marathonInfoResponse.json();

  const runnerColumn = (marathonInfo.schedule.columns as string[]).findIndex(item => {
    const normalized = item.toLowerCase();

    return VALID_RUNNER_COLUMNS.indexOf(normalized) !== -1;
  });

  if (runnerColumn === -1) throw new Error('Could not normalize Horaro data; runner column not found in schedule.');
  
  return {
    source: 'horaro',
    name: `${marathonInfo.schedule.event.name} - ${marathonInfo.schedule.name}`,
    runners: (marathonInfo.schedule.items as HoraroScheduleRow[]).reduce((acc, row) => [
      ...acc,
      ...row.data[runnerColumn].split(',').map((name: String) => ({
        username: name.trim(),
        pronouns: null,
      })),
    ], [] as NormalizedRunnerData[]),
    scheduled: null,
  };
}

export async function fetchNormalizedOengusData(slug: string): Promise<NormalizedEventData> {
  const marathonInfoResponse = await fetch(`https://oengus.io/api/marathons/${slug}`);

  if (marathonInfoResponse.status === 404) throw new Error('No marathon with the provided slug exists.');
  
  const marathonInfo = await marathonInfoResponse.json();
  
  const submissionsResponse = await fetch(`https://oengus.io/api/marathons/${slug}/submissions`);
  const submissions: OengusSubmitter[] = await submissionsResponse.json();

  const scheduleResponse = await fetch(`https://oengus.io/api/marathons/${slug}/schedule`);
  const schedule: { lines: ScheduleLine[] } = await scheduleResponse.json();

  return {
    source: 'oengus',
    name: marathonInfo.name,
    runners: submissions.map(submitter => ({
      username: submitter.user.username,
      pronouns: submitter.user.pronouns,
      twitch: submitter.user.connections.find(item => item.platform === 'TWITCH')?.username ?? null,
      speedruncom: submitter.user.connections.find(item => item.platform === 'SPEEDRUNCOM')?.username ?? null,
    })),
    scheduled: schedule.lines?.reduce((acc, line) => [
      ...acc,
      ...line.runners.map(({ username }) => username),
    ], [] as string[]) ?? null,
  }
}