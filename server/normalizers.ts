import fetch from 'isomorphic-fetch';

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

const VALID_RUNNER_COLUMNS = ['runner', 'runners', 'runner(s)', 'player', 'players', 'player(s)'];

export async function fetchNormalizedHoraroData(organization: string, event: string): Promise<NormalizedEventData> {
  const marathonInfoResponse = await fetch(`https://horaro.org/${organization}/${event}.json`);
  const marathonInfo = await marathonInfoResponse.json();

  const runnerColumn = (marathonInfo.schedule.columns as string[]).findIndex(item => {
    const normalized = item.toLowerCase();

    console.log('normalized', normalized);

    return VALID_RUNNER_COLUMNS.indexOf(normalized) !== -1;
  });

  if (runnerColumn === -1) throw new Error('Could not normalize Horaro data; runner column not found in schedule.');
  
  return {
    source: 'horaro',
    name: marathonInfo.schedule.name,
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