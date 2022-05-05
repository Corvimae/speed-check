import type { NextPage } from 'next'
import React, { useCallback, useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import Head from 'next/head';
import Tippy from '@tippyjs/react';

const OTHER_DISCLAIMER = `All runners with specified pronouns other than "he/him" and "she/her" are grouped under Other. Non-binary pronouns are not normalized enough to provide useful data without this simplification.`;
const UNSPECIFIED_DESCRIPTION = `If we cannot find pronouns on Oengus, Speedrun.com, or the Twitch Pronoun extension, the runner is considered unspecified.`;
const NORMALIZED_PERCENTAGE_DESCRIPTION = "The percentage excluding all runners with no specified pronouns.";
interface PronounResultsBlock {
  'he/him': number;
  'she/her': number;
  other: number;
  none: number;
  notFound?: number;
  error: number;
}
interface PronounCalculationBlock {
  counts: PronounResultsBlock;
  percentages: PronounResultsBlock;
  normalizedPercentages: PronounResultsBlock;

}
interface PronounResults {
  name: string;
  submissions: PronounCalculationBlock;
  schedule: PronounCalculationBlock | null;
}

type Source = 'oengus' | 'horaro';

const SOURCE_CONFIGS: Record<Source, { baseUrl: string; description: string; }> = {
  oengus: {
    baseUrl: 'https://v1.oengus.io/marathon/',
    description: 'Oengus slug',
  },
  horaro: {
    baseUrl: 'https://horaro.org/',
    description: 'Horaro path',
  },
};

const Home: NextPage = () => {
  const [marathonUrl, setMarathonUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [source, setSource] = useState<Source>('oengus');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PronounResults | null>(null);

  const handleSubmit = useCallback(async () => {
    setIsLoading(true);
    setResults(null);
    setError(null);

    const response = await fetch(`/calculate/${source}/${marathonUrl}`);


    if (response.status === 200) {
      const results = await response.json();

      setResults(results);
    } else {
      try {
        const results = await response.json();

        setError(results.error);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setIsLoading(false);
  }, [marathonUrl, source]);

  const handleChangeSource = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSource(event.target.value as Source);
  }, []);

  const handleChangeMarathonUrl = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setMarathonUrl(event.target.value);
  }, []);

  const totalErrors = useMemo(() => {
    if (!results) return 0;

    return results.submissions.counts.error + (results.schedule?.counts.error ?? 0);
  }, [results]);

  return (
    <div>
      <Head>
        <title>Speed Check!</title>
        <meta name="description" content="How diverse is your speedrunning marathon?" />
        <link rel="icon" href="/favicon.png" />
        <meta charSet="UTF-8" />
        <meta name="title" content="Speed Check!" />
        <meta name="description" content="How diverse is your speedrunning marathon?" />

        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://speedcheck.run/" />
        <meta property="og:title" content="Speed Check!" />
        <meta property="og:description" content="How diverse is your speedrunning marathon?" />

        <meta property="twitter:url" content="https://speedcheck.run/" />
        <meta property="twitter:title" content="Speed Check!" />
        <meta property="twitter:description" content="How diverse is your speedrunning marathon?" />
      </Head>
      <Container>
        <MainSection>
          <Title>Speed Check!</Title>
          <Subtitle>How gender diverse is your speedrun marathon?</Subtitle>
          <MethodologyLink href="https://github.com/corvimae/speed-check#pronoun-normalization-methodology" target="_blank" rel="noreferrer">
            See the methodology behind this tool
          </MethodologyLink>
          <SourceSelectorContainer>
            <label htmlFor="sourceSelector">Schedule source:</label>&nbsp;
            <select id="sourceSelector" value={source} onChange={handleChangeSource}>
              <option value='oengus'>Oengus</option>
              <option value='horaro'>Horaro</option>
            </select>
          </SourceSelectorContainer>
          <InputSection>
            <MarathonUrlInputLabel htmlFor="marathonUrlInput">Enter the {SOURCE_CONFIGS[source].description} for your marathon</MarathonUrlInputLabel>
            <UrlInputContainer>
              <UrlPrefix>{SOURCE_CONFIGS[source].baseUrl}</UrlPrefix>
              <UrlInput id="marathonUrlInput" onChange={handleChangeMarathonUrl} />
            </UrlInputContainer>
            <SubmitButton disabled={marathonUrl.trim().length === 0 || isLoading} onClick={handleSubmit}>
              Go!
            </SubmitButton>
            {isLoading && (
              <LoadingContainer>
                <div>Calculating, just a moment...</div>
                <LoadingIcon><div /><div /></LoadingIcon>
              </LoadingContainer>
            )}
            {error && (
              <ErrorCard>{error}</ErrorCard>
            )}
            {results && (
              <ResultsSection>
                <ResultsTitle>Results for {results.name}</ResultsTitle>
                {totalErrors > 0 && (
                  <ErrorCard>
                    There were issues while normalizing pronouns for {totalErrors} runner{totalErrors !== 1 ? 's' : ''}. 
                  </ErrorCard>
                )}
                <ResultsSubtitle>{source === 'horaro' ? 'Schedule' : 'Submissions'}</ResultsSubtitle>
                <ResultsTable>
                  <thead>
                    <tr>
                      <th>Pronouns</th>
                      <th>Count</th>
                      <th>Perecentage</th>
                      <th>
                        <Tippy content={NORMALIZED_PERCENTAGE_DESCRIPTION} arrow duration={0}>
                          <HasTooltip>Normalized Percentage</HasTooltip>
                        </Tippy>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>he/him</td>
                      <td>{results.submissions.counts['he/him']}</td>
                      <td>{(results.submissions.percentages['he/him'] * 100).toFixed(2)}%</td>
                      <td>{(results.submissions.normalizedPercentages['he/him'] * 100).toFixed(2)}%</td>
                    </tr>
                    <tr>
                      <td>she/her</td>
                      <td>{results.submissions.counts['she/her']}</td>
                      <td>{(results.submissions.percentages['she/her'] * 100).toFixed(2)}%</td>
                      <td>{(results.submissions.normalizedPercentages['she/her'] * 100).toFixed(2)}%</td>
                    </tr>
                    <tr>
                      <td>
                        <Tippy content={OTHER_DISCLAIMER} arrow duration={0}>
                          <HasTooltip>Other</HasTooltip>
                        </Tippy>
                      </td>
                      <td>{results.submissions.counts.other}</td>
                      <td>{(results.submissions.percentages.other * 100).toFixed(2)}%</td>
                      <td>{(results.submissions.normalizedPercentages.other * 100).toFixed(2)}%</td>
                    </tr>
                    <tr>
                      <td>
                        <Tippy content={UNSPECIFIED_DESCRIPTION} arrow duration={0}>
                          <HasTooltip>Unspecified</HasTooltip>
                        </Tippy>
                      </td>
                      <td>{results.submissions.counts.none}</td>
                      <td>{(results.submissions.percentages.none * 100).toFixed(2)}%</td>
                      <td>-</td>
                    </tr>
                  </tbody>
                </ResultsTable>
                {results.schedule && (
                  <div>
                    <ResultsSubtitle>Schedule</ResultsSubtitle>
                    <ResultsTable>
                      <thead>
                        <tr>
                          <th>Pronouns</th>
                          <th>Count</th>
                          <th>Perecentage</th>
                          <th>
                            <Tippy content={NORMALIZED_PERCENTAGE_DESCRIPTION} arrow duration={0}>
                              <HasTooltip>Normalized Percentage</HasTooltip>
                            </Tippy>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>he/him</td>
                          <td>{results.schedule.counts['he/him']}</td>
                          <td>{(results.schedule.percentages['he/him'] * 100).toFixed(2)}%</td>
                          <td>{(results.schedule.normalizedPercentages['he/him'] * 100).toFixed(2)}%</td>
                        </tr>
                        <tr>
                          <td>she/her</td>
                          <td>{results.schedule.counts['she/her']}</td>
                          <td>{(results.schedule.percentages['she/her'] * 100).toFixed(2)}%</td>
                          <td>{(results.schedule.normalizedPercentages['she/her'] * 100).toFixed(2)}%</td>
                        </tr>
                        <tr>
                          <td>
                            <Tippy content={OTHER_DISCLAIMER} arrow duration={0}>
                              <HasTooltip>Other</HasTooltip>
                            </Tippy>
                          </td>
                          <td>{results.schedule.counts.other}</td>
                          <td>{(results.schedule.percentages.other * 100).toFixed(2)}%</td>
                          <td>{(results.schedule.normalizedPercentages.other * 100).toFixed(2)}%</td>
                        </tr>
                        <tr>
                          <td>
                            <Tippy content={UNSPECIFIED_DESCRIPTION} arrow duration={0}>
                              <HasTooltip>Unspecified</HasTooltip>
                            </Tippy>
                          </td>
                          <td>{results.schedule.counts.none}</td>
                          <td>{(results.schedule.percentages.none * 100).toFixed(2)}%</td>
                          <td>-</td>
                        </tr>
                      </tbody>
                    </ResultsTable>
                  </div>
                )}
              </ResultsSection>
            )}
          </InputSection>
        </MainSection>
        <Footer>
          Built by <a href="https://twitter.com/corvimae" target="_blank" rel="noreferrer">Corvimae</a>.&nbsp;
          <a href="https://github.com/corvimae/speed-check" target="_blank" rel="noreferrer">View the source</a>
        </Footer>
      </Container>
    </div>
  )
}

export default Home

const Container = styled.div`
  display: flex;
  height: 100vh;
  max-height: 100vh;
  flex-direction: column;
  font-family: "Quicksand";
  font-size: 16px;
  overflow: hidden;
`;


const MainSection = styled.div`
  display: flex;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  align-self: stretch;
  flex-grow: 1;
  overflow-y: auto;
  padding: 1rem 2rem;
`;

const InputSection = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const MarathonUrlInputLabel = styled.label`
  font-weight: 700;
  margin-bottom: 0.25rem;
  font-size: 1.5rem;
`;

const UrlPrefix = styled.div`
  display: flex;
  height: 2.625rem;
  background-color: #e0e0e0;
  align-items: center;
  color: #333;
  border: 1px solid #999;
  box-sizing: border-box;
  border-radius: 0.25rem 0 0 0.25rem;
  border-right: none;
  padding: 0 0.5rem;
`;

const UrlInput = styled.input`
  font-size: 1.75rem;
  font-family: inherit;
  height: 2.625rem;
  border-radius: 0 0.25rem 0.25rem 0;
  border: 1px solid #999;
`;

const UrlInputContainer = styled.div`
  display: flex;
  flex-direction: row;
`;

const Title = styled.h1`
  text-align: center;
  font-size: 3rem;
  margin-bottom: 1rem;
`;

const Subtitle = styled.h2`
  text-align: center;
  font-size: 1.5rem;
  margin-top: 0;
  margin-bottom: 0.5rem;
  font-weight: 400;
`;

const MethodologyLink = styled.a`
  max-width: max-content;
  font-size: 1.25rem;
  margin-bottom: 1rem;
  text-align: center;
  color: rgb(46, 45, 143);
  text-decoration: underline;
`;

const SubmitButton = styled.button`
  font-family: inherit;
  font-size: 2rem;
  margin-top: 0.5rem;
  padding: 0.25rem 2rem;
  background-color: #33af3d;
  color: #fff;
  border: none;
  border-bottom: 0.125rem solid #175c1d;
  border-radius: 0.25rem;
  cursor: pointer;

  &:hover,
  &:active {
    background-color: #56c45f;
  }

  &:disabled {
    opacity: 0.5;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 2rem;
  font-size: 1.75rem;
`;


const loadingKeyframes = keyframes`
  0% {
    top: 2.25rem;
    left: 2.25rem;
    width: 0;
    height: 0;
    opacity: 0;
  }

  4.9% {
    top: 2.25rem;
    left: 2.25rem;
    width: 0;
    height: 0;
    opacity: 0;
  }
  5% {
    top: 2.25rem;
    left: 2.25rem;
    width: 0;
    height: 0;
    opacity: 1;
  }
  100% {
    top: 0px;
    left: 0px;
    width: 4.5rem;
    height: 4.5rem;
    opacity: 0;
  }
`;

const LoadingIcon = styled.div`
  display: inline-block;
  position: relative;
  width: 5rem;
  height: 5rem;
  margin-top: 0.5rem;

  & div {
    position: absolute;
    border: 0.25rem solid #fff;
    opacity: 1;
    border-radius: 50%;
    animation: ${loadingKeyframes} 1s cubic-bezier(0, 0.2, 0.8, 1) infinite;
    box-sizing: content-box;
  }
  
  & div:nth-child(2) {
    animation-delay: -0.5s;
  }
`;

const ResultsSection = styled.section`
  margin-top: 0.5rem;
`;

const ResultsTitle = styled.h2`
  font-weight: 700;
  font-size: 2rem;
  text-align: center;
`;

const ResultsSubtitle = styled.h3`
  font-size: 1.5rem;
  text-align: center;
`;

const ResultsTable = styled.table`
  font-size: 1.25rem;

  & th,
  & td {
    padding: 0.25rem 0.5rem;
    text-align: right;
  }

  & th:nth-of-type(1),
  & td:nth-of-type(1) {
    text-align: left;
  }
`;

const HasTooltip = styled.span`
  border-bottom: 1px dotted #333;
`;

const Footer = styled.div`
  margin-top: auto;
  padding: 0.25rem 0.5rem;
  background-color: #197021;
  color: #fff;

  & a {
    color: #acd3ff;
  }
`;

const ErrorCard = styled.div`
  padding: 1rem;
  background-color: #ffc6c6;
  border: 1px solid #923a3a;
  color: #3f0909;
  margin: 1rem 0;
  font-size: 1.25rem;
`;

const SourceSelectorContainer = styled.div`
  display: flex;
  justify-content: center;
  margin: 0.5rem 0 1rem 0;
`;
