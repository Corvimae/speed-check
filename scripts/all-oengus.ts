import { AggregationResult, calculateForNormalizedData, countsToNormalizedPercentages, countsToPercentages } from '../server/calculate';
import { fetchNormalizedOengusData } from '../server/normalizers';
import pool from '@ricokahler/pool';


interface MarathonResult {
  id: string;
  language: string;
}

const BASE_AGGREGATION_BLOCK = {
  none: 0,
  'he/him': 0,
  'she/her': 0,
  other: 0,
  error: 0,
};

(async () => {
  const allMarathonInfoRequest = await fetch('https://oengus.io/api/marathons/forDates?start=2021-01-01T05:00:00.000Z&end=2022-05-08T05:00:00.000Z&zoneId=America/Chicago');
  const allMarathonInfo: MarathonResult[] = await allMarathonInfoRequest.json();

  const relevantMarathons = allMarathonInfo.filter(item => item.language === 'en')
  
  console.log(`Found ${relevantMarathons.length} relevant events (${allMarathonInfo.length} total).`);

  const allAggregations = (await pool({
    collection: relevantMarathons,
    maxConcurrency: 5,
    task: async item => {
      try {
        console.log(`Fetching and normalizing marathon with slug ${item.id}.`);
        const data = await fetchNormalizedOengusData(item.id);
  
        return await calculateForNormalizedData(data);
      } catch (e) {
        console.error(`Error fetching ${item.id}.`);
        console.error(e);
  
        return null;
      }
    }
  })).filter(item => item !== null) as AggregationResult[];

  console.log('All aggregations fetched and calculated, combining...');

  const combinedAggregation = allAggregations.reduce((acc, item) => ({
    ...acc,
    submissions: {
      none: acc.submissions.none + item.submissions.counts.none,
      'he/him': acc.submissions['he/him'] + item.submissions.counts['he/him'],
      'she/her': acc.submissions['she/her'] + item.submissions.counts['she/her'],
      other: acc.submissions.other + item.submissions.counts.other,
      error: acc.submissions.error + item.submissions.counts.error,
    },
    schedule: {
      none: acc.schedule.none + (item.schedule?.counts.none ?? 0),
      'he/him': acc.schedule['he/him'] + (item.schedule?.counts['he/him'] ?? 0),
      'she/her': acc.schedule['she/her'] + (item.schedule?.counts['she/her'] ?? 0),
      other: acc.schedule.other + (item.schedule?.counts.other ?? 0),
      error: acc.schedule.error + (item.schedule?.counts.error ?? 0),
    }
  }), { submissions: { ...BASE_AGGREGATION_BLOCK }, schedule: { ...BASE_AGGREGATION_BLOCK } });

  console.log({
    counts: combinedAggregation,
    percentages: {
      submissions: countsToPercentages(combinedAggregation.submissions),
      schedule: countsToPercentages(combinedAggregation.schedule),
    },
    normalizedPercentages: {
      submissions: countsToNormalizedPercentages(combinedAggregation.submissions),
      schedule: countsToNormalizedPercentages(combinedAggregation.schedule),
    },
  });
})().then(() => console.log('Done.'));