# ÑIGO Voice Lines

ÑIGO output lines live in `lib/jarvis-voice.ts`.

## Approval Flow

1. Add candidate lines with `status: "pending_approval"`.
2. Review the exact text in code.
3. Change only approved lines to `status: "approved"`.
4. Run `pnpm greetings:gen` to render approved clips.

Normal generation skips pending jokes. To render local previews before approval,
run `pnpm greetings:gen -- --include-pending`; do not commit preview MP3s unless
the matching line is approved.

## DEMON Mode

DEMON mode is configured from Settings. It stores preferences in browser
`localStorage` and does not write to the database.

When enabled, the global controller listens for active use (`pointerdown`,
`keydown`, `wheel`) and rolls a throttled random chance after a few actions. The
current approved sequence is:

1. ÑIGO intro: `Sir {identity}, I have a message.`
2. Random message clip:
   - `public/jarvis/demon-trump-message.mp3`
   - `public/jarvis/demon-connor-speech.mp3`
   - `public/jarvis/demon-connor-message-2.mp3`

The message clips were downloaded from operator-provided YouTube URLs with
`yt-dlp`.

## Current Approved Lines

| Slug | Text | Usage |
| --- | --- | --- |
| `notification-unread-sir` | You have got a notification, sir. | Plays when unread notifications increase after the initial count load. |
| `system-back-online` | Systems are back online, sir. | Reserved for future recovery states after reconnect/service restoration. |
| `demon-mode-online` | Demon mode is online, sir. | Optional confirmation line when DEMON mode is enabled. |

## Pending Approval

| Slug | Text |
| --- | --- |
| `demon-click-audit` | I saw that click, sir. Bold strategy. |
| `demon-calendar-ominous` | Your calendar has made another threat, sir. |
| `joke-pipeline-cardio` | I reviewed the pipeline, sir. Several deals appear to be doing cardio. |
| `joke-humans-work-in-progress` | The CRM is fully operational, sir. The humans remain a work in progress. |
| `joke-ignore-notification` | Another notification, sir. I would ignore it for you, but that is how startups die. |
