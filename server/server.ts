import express, { Response } from 'express';
import next from 'next';
import fetch from'isomorphic-fetch';
import { uniq } from 'lodash';
import NodeCache from 'node-cache';
import { fetchNormalizedHoraroData, fetchNormalizedOengusData, NormalizedEventData, NormalizedRunnerData } from './normalizers';

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

function countsToPercentages(list: Record<string, number> | null) {
  if (!list) return null;

  const total = Object.values(list).reduce((acc, value) => acc + value, 0);

  return Object.entries(list).reduce((acc, [key, value]) => ({
    ...acc,
    [key]: value / total,
  }), {})
}

function countsToNormalizedPercentages(list: Record<string, number> | null) {
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

const port = parseInt(process.env.PORT ?? '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const runnerDataCache = new NodeCache({ stdTTL: 3600 });

async function calculateForNormalizedData(res: Response, data: NormalizedEventData) {
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

    if (user.pronouns === 'she/her' || user.pronouns === 'he/him' || user.pronouns === 'error') {
      return {
        ...acc,
        [user.pronouns]: [...acc[user.pronouns], user.username],
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
        
      if (!submitter) {
        return {
          ...acc,
          notFound: [...acc.notFound, username],
        }
      }

      if (!submitter.pronouns) {
        return { ...acc, none: [...acc.none, submitter.username] };
      }

      if (submitter.pronouns === 'she/her' || submitter.pronouns === 'he/him') {
        return {
          ...acc,
          [submitter.pronouns]: [...acc[submitter.pronouns], submitter.username],
        };
      }

      return {
        ...acc,
        other: [...acc.other, submitter.username],
      };
    }, { none: [], 'she/her': [], 'he/him': [], other: [], notFound: [], error: [] } as Record<string, string[]>));
  }

  const submissionCounts = listToCounts(pronounLists);
  const scheduleCounts = listToCounts(schedulePronouns);
  
  res.json({
    name: data.name,
    submissions: {
      counts: submissionCounts,
      percentages: countsToPercentages(submissionCounts),
      normalizedPercentages: countsToNormalizedPercentages(submissionCounts),
    },
    schedule: scheduleCounts ? {
      counts: scheduleCounts,
      percentages: countsToPercentages(scheduleCounts),
      normalizedPercentages: countsToNormalizedPercentages(scheduleCounts),
    } : null,
  });
}

app.prepare().then(async () => {
  try {
    const server = express();

    server.get('/calculate/oengus/:slug', async (req, res) => {
      const slug = req.params.slug as string;
      
      if (slug) {
        try {
          const data = await fetchNormalizedOengusData(slug);

          await calculateForNormalizedData(res, data);
        } catch (e) {
          res.status(400).json({ error: (e as Error).message });
        }
      } else {
        res.status(400).json({ error: 'Marathon slug is required.' });
      }
    });

    server.get('/calculate/horaro/:organization/:event', async (req, res) => {
      const organization = req.params.organization as string;
      const event = req.params.event as string;
      
      if (organization && event) {
        try {
          const data = await fetchNormalizedHoraroData(organization, event);

          await calculateForNormalizedData(res, data);
        } catch (e) {
          res.status(400).json({ error: (e as Error).message });
        }
      } else {
        res.status(400).json({ error: 'Organization and event are required.' });
      }
    });
    
    server.get('*', (req, res) => handle(req, res));

    server.listen(3000, (): void => {
      console.info(`> Server listening on port ${port} (dev: ${dev})`);
    });
  } catch (e) {
    console.error('Unable to start server, exiting...');
    console.error(e);
    process.exit();
  }
});
