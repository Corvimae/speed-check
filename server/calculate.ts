import { Response } from "express";
import { uniq } from "lodash";
import NodeCache from "node-cache";
import { NormalizedEventData, NormalizedRunnerData } from "./normalizers";

export interface AggregationBlock {
  counts: Record<string, number>;
  percentages: Record<string, number>;
  normalizedPercentages: Record<string, number>;
}

export interface AggregationResult {
  name: string;
  submissions: AggregationBlock;
  schedule: AggregationBlock | null;
}

function dedupePronounList(list: Record<string, string[]>) {
  return Object.entries(list).reduce((acc, [key, value]) => ({
    ...acc,
    [key]: uniq(value)
  }), {})
}

function listToCounts(list: Record<string, string[]> | null) {
  if (!list) return null;

  return Object.entries(list).reduce((acc, [key, value]) => ({
    ...acc,
    [key]: value.length
  }), {})
}

export function countsToPercentages(list: Record<string, number> | null) {
  if (!list) return null;

  const total = Object.values(list).reduce((acc, value) => acc + value, 0);

  return Object.entries(list).reduce((acc, [key, value]) => ({
    ...acc,
    [key]: value / total,
  }), {})
}

export function countsToNormalizedPercentages(list: Record<string, number> | null) {
  if (!list) return null;

  const total = Object.entries(list).reduce((acc, [key, value]) => {
    if (key === 'none' || key === 'error') return acc;

    return acc + value;
  }, 0);

  return Object.entries(list).reduce((acc, [key, value]) => {
    if (key === 'none') return acc;

    return {
      ...acc,
      [key]: value / total,
    };
  }, {});
}

async function fetchForUsername(baseUrl: string, submitter: NormalizedRunnerData, platform: 'twitch' | 'speedruncom') {
  const username = submitter[platform] ?? submitter.username;
  const userRequest = await fetch(`${baseUrl}${encodeURIComponent(username)}`);

  if (userRequest.status !== 200) return null;
  
  return await userRequest.json();
}

const runnerDataCache = new NodeCache({ stdTTL: 3600 });

const HE_HIM_PRONOUNS_SETS = ['he/him', 'he / him', 'he', 'him'];
const SHE_HER_PRONOUNS_SETS = ['she/her', 'she / her', 'she', 'her'];

export async function calculateForNormalizedData(data: NormalizedEventData): Promise<AggregationResult> {
  const submittersWithPronounsPromises: Promise<NormalizedRunnerData>[] = data.runners.map(async (submitter: NormalizedRunnerData) => {
    if (!submitter.pronouns) {
      if (runnerDataCache.has(submitter.username)) {
        return {
          ...submitter,
          pronouns: runnerDataCache.get(submitter.username) as string,
        };
      }

      try {
        // Request from SRC
        const srcUserData = await fetchForUsername('https://www.speedrun.com/api/v1/users/', submitter, 'speedruncom');

        if (srcUserData?.data?.pronouns) {
          runnerDataCache.set(submitter.username, srcUserData.data.pronouns.toLowerCase());

          return {
            ...submitter,
            pronouns: srcUserData.data.pronouns.toLowerCase(),
          };
        }

        const twitchUserData = await fetchForUsername('https://pronouns.alejo.io/api/users/', submitter, 'twitch');

        if (twitchUserData?.length > 0) {
          let pronouns = 'other';

          if (twitchUserData[0].pronoun_id === 'sheher') {
            pronouns = 'she/her';
          } else if (twitchUserData[0].pronoun_id === 'hehim') {
            pronouns = 'he/him';
          }

          runnerDataCache.set(submitter.username, pronouns);

          return {
            ...submitter,
            pronouns,
          };
        }

        return submitter;
      } catch (e) {
        console.error('Pronoun API request failed.');
        console.error(e);

        return {
          ...submitter,
          pronouns: 'error',
        };
      }
    }

    return submitter;
  }, [] as NormalizedRunnerData[]);

  const submittersWithPronouns = await Promise.all(submittersWithPronounsPromises);
  
  const pronounLists = dedupePronounList(submittersWithPronouns.reduce((acc, user) => {
    if (!user.pronouns) {
      return { ...acc, none: [...acc.none, user.username] };
    }

    if (SHE_HER_PRONOUNS_SETS.indexOf(user.pronouns) !== -1) {
      return {
        ...acc,
        'she/her': [...acc['she/her'], user.username],
      }
    }

    if (HE_HIM_PRONOUNS_SETS.indexOf(user.pronouns) !== -1) {
      return {
        ...acc,
        'he/him': [...acc['he/him'], user.username],
      }
    }
    if (user.pronouns === 'error') {
      return {
        ...acc,
        error: [...acc.error, user.username],
      };
    }

    return {
      ...acc,
      other: [...acc.other, user.username],
    };
  }, { none: [], 'she/her': [], 'he/him': [], other: [], error: [] } as Record<string, string[]>));

  let schedulePronouns = null;
  
  if (data.scheduled) {
    schedulePronouns = dedupePronounList((data.scheduled as string[]).reduce((acc, username) => {
      const submitter = submittersWithPronouns.find(item => item.username === username);
        
      if (!submitter || submitter.pronouns === 'error') {
        return {
          ...acc,
          notFound: [...acc.notFound, username],
        }
      }

      if (!submitter.pronouns) {
        return { ...acc, none: [...acc.none, submitter.username] };
      }

      if (SHE_HER_PRONOUNS_SETS.indexOf(submitter.pronouns) !== -1) {
        return {
          ...acc,
          'she/her': [...acc['she/her'], submitter.username],
        }
      }
  
      if (HE_HIM_PRONOUNS_SETS.indexOf(submitter.pronouns) !== -1) {
        return {
          ...acc,
          'he/him': [...acc['he/him'], submitter.username],
        }
      }

      return {
        ...acc,
        other: [...acc.other, submitter.username],
      };
    }, { none: [], 'she/her': [], 'he/him': [], other: [], notFound: [], error: [] } as Record<string, string[]>));
  }

  const submissionCounts = listToCounts(pronounLists);
  const scheduleCounts = listToCounts(schedulePronouns);
  
  return {
    name: data.name,
    submissions: {
      counts: submissionCounts as Record<string, number>,
      percentages: countsToPercentages(submissionCounts) as Record<string, number>,
      normalizedPercentages: countsToNormalizedPercentages(submissionCounts) as Record<string, number>,
    },
    schedule: scheduleCounts ? {
      counts: scheduleCounts as Record<string, number>,
      percentages: countsToPercentages(scheduleCounts) as Record<string, number>,
      normalizedPercentages: countsToNormalizedPercentages(scheduleCounts) as Record<string, number>,
    } : null,
  };
}