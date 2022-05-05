"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const next_1 = __importDefault(require("next"));
const isomorphic_fetch_1 = __importDefault(require("isomorphic-fetch"));
const lodash_1 = require("lodash");
const node_cache_1 = __importDefault(require("node-cache"));
function dedupePronounList(list) {
    return Object.entries(list).reduce((acc, [key, value]) => (Object.assign(Object.assign({}, acc), { [key]: (0, lodash_1.uniq)(value) })), {});
}
function listToCounts(list) {
    if (!list)
        return null;
    return Object.entries(list).reduce((acc, [key, value]) => (Object.assign(Object.assign({}, acc), { [key]: value.length })), {});
}
function countsToPercentages(list) {
    if (!list)
        return null;
    const total = Object.values(list).reduce((acc, value) => acc + value, 0);
    return Object.entries(list).reduce((acc, [key, value]) => (Object.assign(Object.assign({}, acc), { [key]: value / total })), {});
}
function countsToNormalizedPercentages(list) {
    if (!list)
        return null;
    const total = Object.entries(list).reduce((acc, [key, value]) => {
        if (key === 'none' || key === 'error')
            return acc;
        return acc + value;
    }, 0);
    return Object.entries(list).reduce((acc, [key, value]) => {
        if (key === 'none')
            return acc;
        return Object.assign(Object.assign({}, acc), { [key]: value / total });
    }, {});
}
async function fetchForUsername(baseUrl, submitter, platform) {
    var _a;
    const usernameBlock = submitter.user.connections.find(item => item.platform === platform);
    const username = (_a = usernameBlock === null || usernameBlock === void 0 ? void 0 : usernameBlock.username) !== null && _a !== void 0 ? _a : submitter.user.username;
    const userRequest = await (0, isomorphic_fetch_1.default)(`${baseUrl}${username}`);
    return await userRequest.json();
}
const port = parseInt((_a = process.env.PORT) !== null && _a !== void 0 ? _a : '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = (0, next_1.default)({ dev });
const handle = app.getRequestHandler();
const runnerDataCache = new node_cache_1.default({ stdTTL: 3600 });
app.prepare().then(async () => {
    try {
        const server = (0, express_1.default)();
        server.get('/calculate', async (req, res) => {
            const slug = req.query.slug;
            if (slug) {
                try {
                    const marathonInfoResponse = await (0, isomorphic_fetch_1.default)(`https://oengus.io/api/marathons/${slug}`);
                    const marathonInfo = await marathonInfoResponse.json();
                    const submissionsResponse = await (0, isomorphic_fetch_1.default)(`https://oengus.io/api/marathons/${slug}/submissions`);
                    const submissions = await submissionsResponse.json();
                    const submittersWithPronounsPromises = submissions.map(async (submitter) => {
                        var _a;
                        if (!submitter.user.pronouns) {
                            if (runnerDataCache.has(submitter.user.username)) {
                                return Object.assign(Object.assign({}, submitter), { user: Object.assign(Object.assign({}, submitter.user), { pronouns: runnerDataCache.get(submitter.user.username) }) });
                            }
                            try {
                                // Request from SRC
                                const srcUserData = await fetchForUsername('https://www.speedrun.com/api/v1/users/', submitter, 'SPEEDRUNCOM');
                                if ((_a = srcUserData.data) === null || _a === void 0 ? void 0 : _a.pronouns) {
                                    runnerDataCache.set(submitter.user.username, srcUserData.data.pronouns.toLowerCase());
                                    return Object.assign(Object.assign({}, submitter), { user: Object.assign(Object.assign({}, submitter.user), { pronouns: srcUserData.data.pronouns.toLowerCase() }) });
                                }
                                const twitchUserData = await fetchForUsername('https://pronouns.alejo.io/api/users/', submitter, 'TWITCH');
                                if (twitchUserData.length > 0) {
                                    let pronouns = 'other';
                                    if (twitchUserData[0].pronoun_id === 'sheher') {
                                        pronouns = 'she/her';
                                    }
                                    else if (twitchUserData[0].pronoun_id === 'hehim') {
                                        pronouns = 'he/him';
                                    }
                                    runnerDataCache.set(submitter.user.username, pronouns);
                                    return Object.assign(Object.assign({}, submitter), { user: Object.assign(Object.assign({}, submitter.user), { pronouns }) });
                                }
                                return submitter;
                            }
                            catch (e) {
                                console.error('Pronoun API request failed.');
                                console.error(e);
                                return Object.assign(Object.assign({}, submitter), { user: Object.assign(Object.assign({}, submitter.user), { pronouns: 'error' }) });
                            }
                        }
                        return submitter;
                    }, []);
                    const submittersWithPronouns = await Promise.all(submittersWithPronounsPromises);
                    const pronounLists = dedupePronounList(submittersWithPronouns.reduce((acc, { user }) => {
                        if (!user.pronouns) {
                            return Object.assign(Object.assign({}, acc), { none: [...acc.none, user.username] });
                        }
                        if (user.pronouns === 'she/her' || user.pronouns === 'he/him' || user.pronouns === 'error') {
                            return Object.assign(Object.assign({}, acc), { [user.pronouns]: [...acc[user.pronouns], user.username] });
                        }
                        return Object.assign(Object.assign({}, acc), { other: [...acc.other, user.username] });
                    }, { none: [], 'she/her': [], 'he/him': [], other: [], error: [] }));
                    const scheduleResponse = await (0, isomorphic_fetch_1.default)(`https://oengus.io/api/marathons/${slug}/schedule`);
                    const schedule = await scheduleResponse.json();
                    let schedulePronouns = null;
                    if (schedule.lines) {
                        schedulePronouns = dedupePronounList(schedule.lines.reduce((acc, line) => (line.runners.reduce((innerAcc, runner) => {
                            const submitter = submittersWithPronouns.find(item => item.user.username === runner.username);
                            if (!submitter) {
                                return Object.assign(Object.assign({}, innerAcc), { notFound: [...innerAcc.notFound, runner.username] });
                            }
                            if (!submitter.user.pronouns) {
                                return Object.assign(Object.assign({}, acc), { none: [...acc.none, submitter.user.username] });
                            }
                            if (submitter.user.pronouns === 'she/her' || submitter.user.pronouns === 'he/him') {
                                return Object.assign(Object.assign({}, acc), { [submitter.user.pronouns]: [...acc[submitter.user.pronouns], submitter.user.username] });
                            }
                            return Object.assign(Object.assign({}, acc), { other: [...acc.other, submitter.user.username] });
                        }, acc)), { none: [], 'she/her': [], 'he/him': [], other: [], notFound: [], error: [] }));
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
                }
                catch (e) {
                    res.status(400).json(e);
                }
            }
            else {
                res.status(400).json('Marathon slug is required.');
            }
        });
        server.get('*', (req, res) => handle(req, res));
        server.listen(3000, () => {
            console.info(`> Server listening on port ${port} (dev: ${dev})`);
        });
    }
    catch (e) {
        console.error('Unable to start server, exiting...');
        console.error(e);
        process.exit();
    }
});
//# sourceMappingURL=server.js.map