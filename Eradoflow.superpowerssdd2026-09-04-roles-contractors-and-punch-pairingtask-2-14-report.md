
---

## Fix — Approval Insert Error Handling

### What I fixed

The approval insert at line 89–98 in `src/app/(app)/payroll/actions.ts` was
unchecked. If the insert failed (RLS misconfiguration, constraint violation,
etc.), `runPeriod` would still return `ok: true`, leaving the operator with no
indication that nobody was notified to release the money.

### The change

Captured the error from the approval insert and log it server-side if it occurs:

```ts
const { error: approvalError } = await supabase.from("approvals").insert(
  approvalRowFor({...}),
);

if (approvalError) {
  /*
   * The run itself succeeded and its numbers are correct, so this must not
   * fail the action — but a queue nobody was added to is exactly the silence
   * this approval exists to prevent, so it cannot be swallowed either.
   */
  console.error(
    `[payroll] period ${periodId} calculated but its approval could not be queued: ${approvalError.message}`,
  );
}
```

The log prefix `[payroll]` follows the existing convention in
`src/app/api/devices/ingest/route.ts` (`[agent-ingest]`). A failed approval
insert does NOT fail the entire action — the calculation succeeded and its
results are valid — but the error is now diagnosable server-side.

### Verification

- `npm test`: 299 tests passed (19 files).
- `npm run typecheck`: clean.
- `npm run lint`: clean.

### Commit

`0af05be` — fix: log when a payroll run cannot queue its approval

### Confirmation

The fix ensures:
1. A failed approval insert still allows `runPeriod` to return success to the
   user (calculation is valid).
2. The error is logged server-side with the period ID and error message for
   diagnosis by an administrator.
3. The approval queue absence is no longer silent — failure is diagnosable
   without requiring the operator to cross-check a manual log.

