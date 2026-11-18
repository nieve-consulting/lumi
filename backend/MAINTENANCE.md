# Maintenance tasks

Scheduled jobs that keep the backend healthy, and how to run or check them by hand.

## LangGraph checkpoint cleanup

Chats only read the latest checkpoint of a thread, so a weekly job deletes the rest of the `langgraph` checkpoint data every Sunday at 03:00 UTC. The container installation runs it in the `worker` service (`src/container/worker.ts`); on AWS, a scheduled Lambda runs the same cleanup (`src/tasks/checkpointCleanup/lambda/entry.ts`):

- Per thread and namespace it keeps the latest checkpoint, its pending writes and the blobs that checkpoint references.
- Threads without a row in `public.threads` lose all their data.
- Threads with a checkpoint in the last 24h are skipped.
- It stops starting batches before its time budget runs out (the 15 minute timeout on Lambda); the next run continues with the remaining threads.

The SQL lives in `src/ai/checkpointCleanup.ts`. Check it whenever `@langchain/langgraph-checkpoint-postgres` is upgraded.

### Dry run and running it now

In the container installation, the `checkpoint-cleanup` command reports what the cleanup would delete, and `checkpoint-cleanup --apply` deletes it now ([Operator commands](https://docs.lumi.nieve.ai/self-hosting/operations#operator-commands)).

The Lambda handler only deletes on the schedule's `{ "dryRun": false }` event. Any other event only reports what would be deleted, so a manual invocation with `{ "dryRun": true }` is safe; invoke it with `{ "dryRun": false }` to prune outside the schedule. It is idempotent and skips threads active in the last 24h. When invoking it with the AWS CLI, pass `--cli-read-timeout 900` so the CLI waits for the full Lambda timeout (its default is 60 seconds).

The result has the rows and bytes per table (`checkpoints`, `writes`, `blobs`), `freedBytes`, the current `tableSizes`, and `complete: false` when the run stopped before processing every thread. A dry run deletes nothing, but it runs the same queries against the database, so prefer low-traffic hours.

### Run it locally

From `backend`, with the local database running, call the handler with the `DB_*` variables of `.env`. Change `dryRun` to `false` to delete:

```bash
NODE_ENV=development pnpm exec tsx --env-file=.env -e 'import("./src/tasks/checkpointCleanup/lambda/entry.ts").then(({ handler }) => handler({ dryRun: true }, { getRemainingTimeInMillis: () => 15 * 60 * 1000 } as never, () => {})).then((result) => console.log(result))'
```

### Check past runs

Each run logs a summary: `Deleted from N threads:` for a real run (`Would delete` for a dry run), then the rows and MB per table. In the container installation they are in the worker's logs; on AWS, in the function's CloudWatch log group.

### Failures

A failed run is logged, and the next run continues. Check the logs, fix the cause, then run it manually.

Deleted rows do not shrink the table files: vacuum makes the space reusable, so the logged table sizes stop growing rather than drop.
