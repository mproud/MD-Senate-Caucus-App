# MD Senate GOP App

## Secrets and Environment Variables

```bash
npx wrangler secret put --env production DATABASE_URL
```

## To Do

### Report Style

```
[center]
Second Reader Calendar
MM/DD/YYYY
[/center]

Bill Number | Sponsor | Title | Committee | Vote | Action | Notes
[ FIN REPORT NUMBER 53 ]
...

[ FIN REPORT NUMBER 54 ]
...

[ CONSENT CALENDAR NUMBER 00 ]
...
```


### Authentication

- [x] Implement Clerk Authentication
- [ ] Image on /login page

### Data

- [ ] Re-fetch data button


### Feature Requests/Changes

** Report to PDF and Excel

Reports - How did House vote on the crossfile? 000-000-00

Search - Dropdown for split votes (Party line, mostly party, mixed vote, Dem split)

User Permissions
	[x] Floor reports can only be run by Caucus Staff permission
	- Users can be attached to a committee only to edit bills/reports

Alert bills - send email alert



- Look at witness list? (low priority) Ex - Chamber, MACO, etc oppose a bill
	- Teresa sending examples. Email/upload ingest?




Tag key votes? Tags (and notes?) need to be searchable
	Tag bills as Freedom Caucus? Search House votes by Party Line vote?



Add party to legislators
	Alert/tag party line votes (show blue/red visually)

Alerts - Track specific bills, notification of changes
	- Track committees
	- Alerts are manually defined
	-> Email alert. Digest?


[x] Re-Referred to Committee
Assigned to another committee
- Bills can be assigned to multiple committees - Primary (main/overrides other), Secondary Committee


-- WISHLIST --

Bonus #1 - Input House Votes
         - Tags & Alerts in Floor Reports

Bonus #2 - Pull committee voting report & auto ingest


## -- GENERAL/BACKEND --

Analytics & Admin visibility; Logging/Tracking


## -- TESTING --

- [x] - Choose archive date for testing
- [x] - Fetch data from archive automatically
- [x] -> Sample Reports

Cost? MX and support + Development
	- Hands-on training and testing first week(s) of Session




-- Completed --
[x] Print Alert/Icon/Yellow backgorund on alert bills
[x] - Add Consent Calndar #___ with bills
[x] Report # By Committee -> Report Sheet
[x] Floor votes - add notes to floor vote
[x] Consent Calendars!
[x] Dashboard - show alert bills, not the today calendar
During session, data should reload QUICKLY during normal hours
	- Refresh data button - show 'Data last fetched at ...'
Committee votes popup - remove House Committees from Popup and filter/search
	- Add excused to choices
[x] Special Order + Layovers!
[x] - Reports - 2nd, 3rd, Consent, Layover, Special Order, Exec Noms
	- Exec noms & Rules = Exec noms reports are separate. Add line for manually writing noms
Include Joint Resolutions
