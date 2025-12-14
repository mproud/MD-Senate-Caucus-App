# Known issues/gotchas

// Where I left off - bill votes aren't being recored. HB18 was the example - the actions are going into BillAction, but no recorded numbers.

# Database Tables Explained

## Bills

You guessed it, the table with bills.

## BillEvent

Adding a row to this is what triggers the actual event to fire to send a notification

## BillAction

This is where actions for the bill (committee report, committee hearing scheduled, amendments, votes, etc) are scheduled
