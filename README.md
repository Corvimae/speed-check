# speed-check

A webpage for determining how gender diverse a speedrun marathon listed on Oengus, Horaro, or a GDQ donation tracker instance is.

## Disclaimer
I recognize that pronouns are not necessarily reflective of one's gender identity; however, they're the only
publicly available data source for determining any sort of empirical metrics on gender representation in
speedrunning. For this reason, the results are displayed as simply an aggregation of pronouns, rather than 
as any sort of judgment on what genders those pronouns might represent.

Any pronouns other than "he", "she", "he/him" and "she/her" (whole string match, normalized for capitalization and spacing) are considered "other", as otherwise the data is extremely noisy - non-binary pronouns are not normalized across multiple data sources and I don't want to make assumptions. This
tool is primarily designed for determining trends of minority gender representation overall rather than for
more granular observations, as the data simply doesn't permit it.

## Pronoun Normalization Methodology
Given a marathon in a schedule manager:
1. Fetch all the submissions.
2. For each unique runner, see if their pronouns are set in the tool.
3. If they're not, see if they've linked their speedrun.com profile and fetch from the SRC API. If they didn't link their SRC profile, see if there's a SRC profile matching their username and use that.
4. If that doesn't provide any pronouns, see if they've linked their Twitch account and fetch from the Twitch pronouns extension API at pronouns.alejo.io. If they didn't link their Twitch account, see if there's a Twitch account matching their username and use that.
5. If that _still_ doesn't provide any pronouns, we're out of options and we'll just assume they haven't provided them.
6. If a runner's pronouns are he/him or she/her, bucket them as such. Any other pronouns are bucked under 'other'.
7. If the marathon has a published schedule, use the data from above to determine schedule pronoun distribution as well.

## Normalized Percentages
The `normalizedPercentages` data is calculated by throwing out all of the `none` results; that is, we assume that unspecified pronouns adhere to the same ratio as the rest of the submissions.
