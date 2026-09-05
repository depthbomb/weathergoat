# Alert delivery recovery

Apply migrations (`bun run migrate:p`) and generate the client (`bun run generate-client`)
before running this version. The additive `20260905013000_alert_delivery_claims`
migration preserves existing records and adds `AlertDeliveryClaim`.

The bot claims each alert/guild/channel tuple before a webhook send. The unique
claim prevents subsequent attempts, including after restart. Automatic transport
and 5xx retries are disabled for these webhook sends; explicit API rejections
(4xx) release the claim for a later polling attempt.

After a successful send, the message ID is saved on the claim. Recording
`SentAlert`, scheduling optional cleanup, and marking the claim finalized happen
in one transaction. Failed bookkeeping is recovered before subsequent alert
polls without sending again. A live process also retains the receipt if its first
DB write fails. Finalized claims are removed after alert expiry; expired provider
alerts are not sent.

Discord and SQLite cannot participate in one atomic transaction. A crash between
claim creation and receipt persistence, or an ambiguous transport failure, leaves
a claim with `messageId IS NULL`. It is deliberately not retried automatically:
the message might already exist. These unresolved claims remain available for
operator review, including after expiry. This favors duplicate prevention over
automatic retries when the outcome is unknown; it is not an exactly-once guarantee.

Read-only diagnostic query:

```sql
SELECT id, alertId, guildId, channelId, createdAt, expiresAt, messageId
FROM AlertDeliveryClaim
WHERE finalized = false
ORDER BY createdAt;
```

For claims with a message ID, normal recovery retries bookkeeping. For a claim
without one, inspect the destination channel: if the message exists, an operator
can record its ID on the claim and let recovery finish. Only remove a claim to
allow another send after confirming that no message was created. Do not bulk
reset unresolved claims. These actions modify operational data and are manual.

Rollback: older code ignores this additive table and loses its duplicate-prevention
protection. Drain known receipts and review unresolved claims before running an
older version. Do not drop the table as part of an application rollback.

Validation: `bun test src/services/alert-delivery.test.ts` applies the full migration
history to an isolated SQLite database, preserves an existing SentAlert row across
the new migration, and checks cleanup rollback, recovery after service restart,
concurrent claims, receipt-write failure, ambiguous sends, definitive rejection,
expired events and SQLite integrity. It uses a subprocess so Windows can release
native SQLite handles before deleting the test database. No production DB is used.
