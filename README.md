# Known issues/gotchas

- User table in Database, invite/add/remove user functionality!
- Figure out prod user - maybe shortcut and use Clerk components for now?
- Single bill page - Set flag api response 400
- Single bill page - display votes numbers! this needs to be grabbed from the scraper
- Single bill page - when manually recording a vote, trigger the status update/notification
- Single bill page - after recording a vote, it needs to show up in the dashboard


# Database Tables Explained

## Bills

You guessed it, the table with bills.

## BillEvent

Adding a row to this is what triggers the actual event to fire to send a notification

## BillAction

This is where actions for the bill (committee report, committee hearing scheduled, amendments, votes, etc) are scheduled
-- Explain all actions - COMMITTEE_REPORT, etc