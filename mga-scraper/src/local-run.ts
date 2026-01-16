import 'dotenv/config'

// Change this for whgatever we're testing
// import { handler as legislatorsCommitteesHandler } from './index' // @TODO rename this
// import { runBillsFromJsonScrape as handler } from './sync-bills-from-json'
// import { handler } from './floor-calendars'

/////// These functions work
import { handler } from './scrape-agenda'
import { runBillsFromJsonScrape } from './sync-bills-from-json'
// import { handler } from './scrape-legislators-committees'

const now = new Date();

const agendaDate =
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    now.getFullYear()

async function mainScrapeSenate() {
    console.log('Fetch Senate Agenda', agendaDate)
    // Fake Lambda event/context
    const event = {
        source: 'local-test',
        url: `https://mgaleg.maryland.gov/mgawebsite/FloorActions/Agenda/senate-${agendaDate}-1`,
    }

    const context = {
        awsRequestId: 'local-test-req-123',
        functionName: 'mga-scraper-local',
        functionVersion: '$LATEST',
        memoryLimitInMB: '1024',
        invokedFunctionArn: 'arn:aws:lambda:local:123456789012:function:mga-scraper-local',
        getRemainingTimeInMillis: () => 30_000,

        // no-ops for the rest
        callbackWaitsForEmptyEventLoop: true,
        done: () => {},
        fail: () => {},
        succeed: () => {},
        logGroupName: '/aws/lambda/mga-scraper-local',
        logStreamName: 'local',
    } as any

    try {
        const res = await handler(event, context)
        console.log('Lambda-like response:', res)
    } catch (err) {
        console.error('Error running handler locally:', err)
        process.exit(1)
    }
}

async function mainScrapeHouse() {
    console.log('Fetch House Agenda', agendaDate)
    // Fake Lambda event/context
    const event = {
        source: 'local-test',
        url: `https://mgaleg.maryland.gov/mgawebsite/FloorActions/Agenda/house-${agendaDate}-1`,
    }

    const context = {
        awsRequestId: 'local-test-req-123',
        functionName: 'mga-scraper-local',
        functionVersion: '$LATEST',
        memoryLimitInMB: '1024',
        invokedFunctionArn: 'arn:aws:lambda:local:123456789012:function:mga-scraper-local',
        getRemainingTimeInMillis: () => 30_000,

        // no-ops for the rest
        callbackWaitsForEmptyEventLoop: true,
        done: () => {},
        fail: () => {},
        succeed: () => {},
        logGroupName: '/aws/lambda/mga-scraper-local',
        logStreamName: 'local',
    } as any

    try {
        const res = await handler(event, context)
        console.log('Lambda-like response:', res)
    } catch (err) {
        console.error('Error running handler locally:', err)
        process.exit(1)
    }
}


async function mainScrapeJson() {
    // Fake Lambda event/context
    const event = {
        source: 'local-test',
    }

    const context = {
        awsRequestId: 'local-test-req-123',
        functionName: 'mga-scraper-local',
        functionVersion: '$LATEST',
        memoryLimitInMB: '1024',
        invokedFunctionArn: 'arn:aws:lambda:local:123456789012:function:mga-scraper-local',
        getRemainingTimeInMillis: () => 30_000,

        // no-ops for the rest
        callbackWaitsForEmptyEventLoop: true,
        done: () => {},
        fail: () => {},
        succeed: () => {},
        logGroupName: '/aws/lambda/mga-scraper-local',
        logStreamName: 'local',
    } as any

    try {
        const res = await runBillsFromJsonScrape(event, context)
        console.log('Lambda-like response:', res)
    } catch (err) {
        console.error('Error running handler locally:', err)
        process.exit(1)
    }
}

mainScrapeJson()
mainScrapeSenate()
mainScrapeHouse()
