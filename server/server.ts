import express from 'express';
import next from 'next';
import fetch from'isomorphic-fetch';
import { uniq } from 'lodash';

interface Submitter {
  user: {
    username: string;
    pronouns: string | null;
    connections: {
      platform: string;
      username: string;
    }[];
  };
}

interface ScheduleLine {
  runners: {
    username: string;
  }[];
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
    if (key === 'none') return acc;

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

async function fetchForUsername(baseUrl: string, submitter: Submitter, platform: string) {
  const usernameBlock = submitter.user.connections.find(item => item.platform === platform);
  const username = usernameBlock?.username ?? submitter.user.username;
  const userRequest = await fetch(`${baseUrl}${username}`);
  
  return await userRequest.json();
}

const port = parseInt(process.env.PORT ?? '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  try {
    const server = express();

    server.get('/calculate', async (req, res) => {
      const slug = req.query.slug as string;
      
      if (slug) {
        try {
          const marathonInfoResponse = await fetch(`https://oengus.io/api/marathons/${slug}`);
          const marathonInfo = await marathonInfoResponse.json();
          
          const submissionsResponse = await fetch(`https://oengus.io/api/marathons/${slug}/submissions`);
          const submissions = await submissionsResponse.json();    

          const submittersWithPronounsPromises: Promise<Submitter>[] = submissions.map(async (submitter: Submitter) => {
            if (!submitter.user.pronouns) {
              try {
                // Request from SRC
                const srcUserData = await fetchForUsername('https://www.speedrun.com/api/v1/users/', submitter, 'SPEEDRUNCOM');

                if (srcUserData.data?.pronouns) {
                  return {
                    ...submitter,
                    user: {
                      ...submitter.user,
                      pronouns: srcUserData.data.pronouns.toLowerCase(),
                    },
                  };
                }

                const twitchUserData = await fetchForUsername('https://pronouns.alejo.io/api/users/', submitter, 'TWITCH');

                if (twitchUserData.length > 0) {
                  let pronouns = 'other';

                  if (twitchUserData[0].pronoun_id === 'sheher') {
                    pronouns = 'she/her';
                  } else if (twitchUserData[0].pronoun_id === 'hehim') {
                    pronouns = 'he/him';
                  }

                  return {
                    ...submitter,
                    user: {
                      ...submitter.user,
                      pronouns,
                    },
                  };
                }
                return submitter;
              } catch (e) {
                console.error('SRC API request failed.');
                console.error(e);
                return submitter;
              }
            }

            return submitter;
          }, [] as Submitter[]);

          const submittersWithPronouns = await Promise.all(submittersWithPronounsPromises);
          
          const pronounLists = dedupePronounList(submittersWithPronouns.reduce((acc, { user }) => {
            if (!user.pronouns) {
              return { ...acc, none: [...acc.none, user.username] };
            }

            if (user.pronouns === 'she/her' || user.pronouns === 'he/him') {
              return {
                ...acc,
                [user.pronouns]: [...acc[user.pronouns], user.username],
              };
            }

            return {
              ...acc,
              other: [...acc.other, user.username],
            };
          }, { none: [], 'she/her': [], 'he/him': [], other: [] } as Record<string, string[]>));

          const scheduleResponse = await fetch(`https://oengus.io/api/marathons/${slug}/schedule`);
          const schedule = await scheduleResponse.json();

          let schedulePronouns = null;
          
          if (schedule.lines) {
            schedulePronouns = dedupePronounList((schedule.lines as ScheduleLine[]).reduce((acc, line) => (
              line.runners.reduce((innerAcc, runner) => {
                const submitter = submittersWithPronouns.find(item => item.user.username === runner.  username);
                
                if (!submitter) {
                  return {
                    ...innerAcc,
                    notFound: [...innerAcc.notFound, runner.username],
                  }
                }

                if (!submitter.user.pronouns) {
                  return { ...acc, none: [...acc.none, submitter.user.username] };
                }
      
                if (submitter.user.pronouns === 'she/her' || submitter.user.pronouns === 'he/him') {
                  return {
                    ...acc,
                    [submitter.user.pronouns]: [...acc[submitter.user.pronouns], submitter.user.username],
                  };
                }
      
                return {
                  ...acc,
                  other: [...acc.other, submitter.user.username],
                };
              }, acc)
            ), { none: [], 'she/her': [], 'he/him': [], other: [], notFound: [] } as Record<string, string[]>));
          }

          const submissionCounts = listToCounts(pronounLists);
          const scheduleCounts = listToCounts(schedulePronouns);
          
          res.json({
            // submissions: pronounLists,
            // schedule: schedulePronouns,
            name: marathonInfo.name,
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
        } catch (e) {
          res.status(400).json(e);
        }
      } else {
        res.status(400).json('Marathon slug is required.');
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
