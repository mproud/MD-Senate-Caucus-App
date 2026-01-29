import axios from 'axios'
import * as cheerio from 'cheerio'

export async function fetchHtml(url: string): Promise<cheerio.CheerioAPI> {
    console.log('Fetch HTML', url )
    const res = await axios.get(url, {
        // if we ever have to include a user agent string or something for scraping
        // headers: {
        //     'User-Agent':
        //         'the-custom-user-agent-string',
        // },
    })

    return cheerio.load(res.data)
}

export async function fetchRawHtml(url: string): Promise<string> {
    console.log('Fetch raw HTML', url )

    const res = await axios.get(url, {
        // if we ever have to include a user agent string or something for scraping
        // headers: {
        //     'User-Agent':
        //         'the-custom-user-agent-string',
        // },
    })

    return res.data
}

export async function fetchJson<T = unknown>(url: string): Promise<T> {
    const res = await axios.get<T>(url, {
        // if we ever have to include a user agent string or something for scraping
        // headers: {
        //     'User-Agent':
        //         'the-custom-user-agent-string',
        // },
    })
    
    return res.data
}
