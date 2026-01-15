# To Do

- When a user joins the waitlist, send an email to all admins (BCC super admins). Deep link to invite page?
- When deleting a user, remove their alerts
- Scraper isn't attaching a bill to a committee automatically - I think this is fixed?
- Add chamber to calendar options/filter
- Bills - filter by committee doesn't work
- EVENT ALERTS!!!
- Alerts page!
- Automatic cron
- Dashboard - /api/flag is triggering a 500 randomly
- Constitutional Amendment status
- Search bills by status?

# Known issues/gotchas

- [ ] User Menu - Accoumt, Settings, etc
- Figure out prod user - maybe shortcut and use Clerk components for now?
- Single bill page - display votes numbers! this needs to be grabbed from the scraper
- Single bill page - when manually recording a vote, trigger the status update/notification
- Single bill page - after recording a vote, it needs to show up in the dashboard

# Completed To Do

- [x] Users - invite/add/remove user functionality!



# Database Tables Explained

## Alert

This is where a user subscribes to a bill's events

## Bills

You guessed it, the table with bills.

## BillEvent

Adding a row to this is what triggers the actual event to fire to send a notification

## BillAction

This is where actions for the bill (committee report, committee hearing scheduled, amendments, votes, etc) are scheduled
-- Explain all actions - COMMITTEE_REPORT, etc