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
- Legislator scraper - Palakovich Carr and Lewis Young
- Optimize the bill scraper. It's taking too long already

# Known issues/gotchas

- [ ] User Menu - Accoumt, Settings, etc
- Single bill page - display votes numbers! this needs to be grabbed from the scraper
- Single bill page - when manually recording a vote, trigger the status update/notification
- Single bill page - after recording a vote, it needs to show up in the dashboard

# Completed To Do

- [x] Users - invite/add/remove user functionality!
- [x] Figure out prod user - maybe shortcut and use Clerk components for now?


# Database Tables Explained

## Alert

This is where a user subscribes to a bill's events

## AlertDelivery

Track progress/deliveries of alerts to users - this is basically the log of outbound notifications

## Bills

You guessed it, the table with bills.

## BillEvent

Adding a row to this is what triggers the actual event to fire to send a notification. Outbound notifications go to AlertDelivery

## BillAction

This is where actions for the bill (committee report, committee hearing scheduled, amendments, votes, etc) are scheduled
-- Explain all actions - COMMITTEE_REPORT, etc