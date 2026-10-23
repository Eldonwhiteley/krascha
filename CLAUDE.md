# Krascha

## Old copies

- **Bump `FEATURES` and `MIN_UPLOAD_FEATURES` together when a change alters what an upload counts or sends.** That covers new or changed achievements, word lists, scoring and upload fields. Both live in `src/shared/leaderboard.ts`, so set both to the same new number. The board then turns away any copy older than that with the update commands, and copies that can update themselves start on it. Without the bump, old copies keep uploading counts the board no longer agrees with.
- **Never drop the `features` check in the Worker's upload.** The error text is the only way to reach a copy too old to update itself, since every copy back to the first prints it word for word.
