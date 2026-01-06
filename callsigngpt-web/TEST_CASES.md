# CallSignGPT Website Test Cases

## Purpose
- Provide a comprehensive manual test suite for the CallSignGPT website and its API integrations.
- Derived from the current codebase in callsigngpt-web and callsigngpt-api.

## Scope
- Next.js UI in callsigngpt-web.
- Backend services used by the UI: callsigngpt-api, Supabase, and SMTP email for report issue.
- LLM provider integrations surfaced through the API (/chat).

## Environments and prerequisites
- Web app running at http://localhost:3000 (or deployed URL).
- API running at http://localhost:3001 or NEXT_PUBLIC_API_URL.
- Supabase configured with auth, conversations table, model_definitions, app_settings, and RPC increment_user_model_usage.
- SMTP configured for /api/report-issue (SMTP_HOST, SMTP_USER, SMTP_PASS).
- Test accounts:
  - user A (email and password).
  - user B (for access control and multi-account tests).
  - Google OAuth test user.

## Test data
- Short message: "Hello".
- Search-triggering message: "Show the latest weather in New York today".
- No-search message: "No search: explain recursion".
- Code block message:
```ts
const hello = "world";
```
- Large message: 5000+ characters.
- Files:
  - small.png (<= 1 MB).
  - large.bin (> MAX_ATTACHMENT_MB).
  - notes.txt (text file).
  - sample.pdf (non-text binary).

## Test cases

### Authentication and session

#### AUTH-01: Sign up with email and password
Preconditions:
- User is logged out.
Steps:
1. Open /signup.
2. Enter name, optional phone, email, and a valid password.
3. Submit the form.
Expected:
- Account is created and user is redirected to /.
- Session is established and sidebar shows the user email.

#### AUTH-02: Password policy enforcement
Preconditions:
- User is on /signup.
Steps:
1. Enter a password that misses one required rule (for example, no uppercase).
2. Submit the form.
Expected:
- Password help text appears and input is focused.
- No account is created and the page remains on /signup.

#### AUTH-03: Country picker search and selection
Preconditions:
- User is on /signup.
Steps:
1. Open the country code dropdown.
2. Search by country name and by dial code.
3. Select a country.
4. Press Escape and click outside to close the list.
Expected:
- Results filter by name, ISO, and dial code.
- Selected dial code appears in the control.
- Dropdown closes on Escape and outside click.

#### AUTH-04: Phone normalization (signup)
Preconditions:
- User is on /signup.
Steps:
1. Enter a phone number with spaces and punctuation (example: "+1 (555) 123-4567").
Expected:
- Input is normalized to digits and optional leading plus.
- Form submission still works because phone is optional here.

#### AUTH-05: Sign up with Google OAuth
Preconditions:
- Google OAuth is configured in Supabase.
Steps:
1. Click "Sign up with Google".
2. Complete OAuth consent.
Expected:
- User is redirected back to /.
- Session is established.

#### AUTH-06: Login with email and password
Preconditions:
- User has an existing account.
Steps:
1. Open /login.
2. Enter email and password.
3. Submit the form.
Expected:
- User is redirected to /.
- Session is established and sidebar shows user profile.

#### AUTH-07: Login failure
Preconditions:
- User is on /login.
Steps:
1. Enter a valid email and invalid password.
2. Submit the form.
Expected:
- Status dialog shows "Sign in failed".
- User remains on /login.

#### AUTH-08: Auth gating on chat and account pages
Preconditions:
- User is logged out.
Steps:
1. Navigate to /.
2. Navigate to /account.
Expected:
- User is redirected to /login.

#### AUTH-09: Redirect away from login/signup when authenticated
Preconditions:
- User is logged in.
Steps:
1. Navigate to /login.
2. Navigate to /signup.
Expected:
- User is redirected to /.

#### AUTH-10: Sign out from sidebar menu
Preconditions:
- User is logged in on /.
Steps:
1. Open the sidebar menu.
2. Click "Logout".
Expected:
- Session is cleared and user is redirected to /login.

#### AUTH-11: Session persistence
Preconditions:
- User is logged in on /.
Steps:
1. Refresh the page.
Expected:
- Session remains active and user stays on /.

### Navigation and layout

#### NAV-01: TopBar behavior by route
Preconditions:
- None.
Steps:
1. Open /login and /signup.
2. Open /.
Expected:
- Login and signup show branding without model picker.
- Chat page shows model picker and model description.

#### NAV-02: Sidebar open and close on mobile
Preconditions:
- Use a mobile viewport.
Steps:
1. Tap "Chats" on the top bar.
2. Tap outside the sidebar overlay.
3. Tap the close button in the sidebar header.
Expected:
- Sidebar opens and closes using both overlay and close button.

#### NAV-03: New chat controls
Preconditions:
- User is logged in on /.
Steps:
1. Click "New chat" in the top bar.
2. Click "Start new chat" in the sidebar.
Expected:
- Conversation resets to a new chat with only the greeting message.

### Models and theme

#### MODEL-01: Model list loads from API
Preconditions:
- /models returns at least one entry.
Steps:
1. Open / and wait for model picker.
Expected:
- Model picker shows options with display names.

#### MODEL-02: Model selection updates theme
Preconditions:
- User is on / with model picker loaded.
Steps:
1. Select a different model.
Expected:
- Theme colors and header text update for the selected model.

#### MODEL-03: Model selection persists to the conversation
Preconditions:
- User has an existing conversation selected.
Steps:
1. Change the model.
2. Refresh the page or reload the conversation.
Expected:
- Selected model remains associated with the conversation.

#### MODEL-04: Model list does not include current value
Preconditions:
- Mock /models response without the current model key.
Steps:
1. Load /.
Expected:
- Model picker selects the first available model automatically.

#### MODEL-05: Quota fallback updates model
Preconditions:
- Backend triggers GPT-5 daily limit fallback.
Steps:
1. Send a chat message using a GPT-5 model.
Expected:
- Status dialog indicates fallback to GPT-4o mini.
- Model picker updates to the fallback model.

### Chat and streaming

#### CHAT-01: Greeting message
Preconditions:
- User is logged in on /.
Steps:
1. Open a new chat.
Expected:
- First message is a system greeting referencing the selected model name.

#### CHAT-02: Send a text message and receive a streamed response
Preconditions:
- API /chat is reachable.
Steps:
1. Enter "Hello" and send.
2. Observe assistant response streaming.
Expected:
- User and assistant messages appear.
- Assistant response streams and completes.

#### CHAT-03: Shift+Enter for newline
Preconditions:
- User is in the composer.
Steps:
1. Type a multi-line message using Shift+Enter.
2. Press Enter to send.
Expected:
- Shift+Enter inserts a newline.
- Enter sends the message.

#### CHAT-04: Typing indicator during streaming
Preconditions:
- Streaming is enabled.
Steps:
1. Send a message.
Expected:
- Typing indicator appears while the assistant response streams.

#### CHAT-05: Stop streaming
Preconditions:
- Streaming response is in progress.
Steps:
1. Click the Stop button.
Expected:
- Streaming stops and loading state ends.

#### CHAT-06: Continue response after interruption
Preconditions:
- A response was interrupted and the assistant has partial content.
Steps:
1. Click "Continue response".
Expected:
- A new message is sent with "Continue" and the assistant continues.

#### CHAT-07: Search indicator appears for search-triggering queries
Preconditions:
- Backend search is enabled.
Steps:
1. Send a query that should trigger search (example: "Show the latest weather in New York today").
Expected:
- Search indicator appears while the backend runs search.

#### CHAT-08: Search indicator trims long queries
Preconditions:
- Backend search is enabled.
Steps:
1. Send a long query (over 64 characters).
Expected:
- Search indicator shows a truncated query label.

#### CHAT-09: Code block rendering and copy
Preconditions:
- Assistant responds with fenced code blocks.
Steps:
1. Ask for code output.
2. Click "Copy" on the code block.
Expected:
- Code block is styled separately.
- Clipboard contains the code and button shows "Copied" briefly.

#### CHAT-10: Message timestamps
Preconditions:
- At least one user and assistant message exists.
Steps:
1. Observe timestamps under messages.
Expected:
- Timestamps appear in a readable format.

#### CHAT-11: Jump to present button
Preconditions:
- Conversation has enough messages to scroll.
Steps:
1. Scroll up in the chat area.
2. Observe the "Jump to present" button.
3. Click the button.
Expected:
- Button appears when not at bottom and scrolls to the latest message.

#### CHAT-12: Error dialog for chat failures
Preconditions:
- API base URL is missing or the API returns 500.
Steps:
1. Send a message.
Expected:
- Status dialog shows an error message and chat remains usable.

#### CHAT-13: Daily quota exceeded messaging
Preconditions:
- API returns a quota error containing "Daily quota exceeded".
Steps:
1. Send a message until quota is exceeded.
Expected:
- Status dialog shows a friendly, normalized quota message.

#### CHAT-14: Long conversation handling
Preconditions:
- Conversation has more than 60 prior messages.
Steps:
1. Continue chatting past 60 messages.
Expected:
- New messages are sent successfully.
- Context trimming does not crash the UI.

### Attachments

#### ATT-01: Attach and send an image
Preconditions:
- User is logged in on /.
Steps:
1. Click the attachment button.
2. Select small.png.
3. Send the message.
Expected:
- Preview shows the image and metadata.
- Image appears in the message bubble.

#### ATT-02: Paste image from clipboard
Preconditions:
- User is logged in on /.
Steps:
1. Copy an image to clipboard.
2. Paste into the composer.
3. Send.
Expected:
- Image preview appears and is sent successfully.

#### ATT-03: Attach and send a non-image file
Preconditions:
- User is logged in on /.
Steps:
1. Attach notes.txt or sample.pdf.
2. Send.
Expected:
- File metadata appears in the message bubble.
- Download link is available when a data URL exists.

#### ATT-04: Remove attachment before sending
Preconditions:
- An attachment is selected.
Steps:
1. Click the remove attachment icon.
Expected:
- Attachment preview disappears and file input resets.

#### ATT-05: Attachment size limit
Preconditions:
- MAX_ATTACHMENT_MB configured (default 5 MB).
Steps:
1. Attach large.bin (> MAX_ATTACHMENT_MB).
Expected:
- Error banner appears and file is not attached.

### Conversations and history

#### CONV-01: Conversation creation and title derivation
Preconditions:
- User starts a new chat.
Steps:
1. Send a message such as "Quarterly roadmap review".
Expected:
- A conversation is created and its title is derived from the first user message.

#### CONV-02: Conversation list ordering
Preconditions:
- At least two conversations exist.
Steps:
1. Open sidebar.
Expected:
- Most recently updated conversation appears first.

#### CONV-03: Select a conversation
Preconditions:
- At least one conversation exists.
Steps:
1. Click a conversation in the sidebar.
Expected:
- Messages load and URL includes ?c=<id>.

#### CONV-04: Rename a conversation
Preconditions:
- A conversation exists.
Steps:
1. Click the rename icon in a history item.
2. Enter a new title and press Enter.
Expected:
- Title updates in the list and persists on reload.

#### CONV-05: Cancel rename
Preconditions:
- Rename input is open.
Steps:
1. Press Escape or click outside.
Expected:
- Title reverts and no change is saved.

#### CONV-06: Delete a conversation
Preconditions:
- A conversation exists.
Steps:
1. Click the delete icon.
2. Confirm deletion.
Expected:
- Conversation is removed from the list.
- If it was active, the chat resets to a new conversation.

#### CONV-07: Cancel delete
Preconditions:
- Delete confirmation dialog is open.
Steps:
1. Click Cancel.
Expected:
- Conversation remains in the list.

#### CONV-08: Invalid conversation ID in URL
Preconditions:
- User is logged in.
Steps:
1. Navigate to /?c=invalid-id.
Expected:
- UI resets to a new chat and query param is cleared.

### Account settings

#### ACC-01: Load account profile
Preconditions:
- User is logged in.
Steps:
1. Open /account.
Expected:
- Profile details load (email, name, phone, plan).

#### ACC-02: Save profile with confirmation
Preconditions:
- User is on /account.
Steps:
1. Edit name or phone.
2. Click Save profile.
3. Confirm in the dialog.
Expected:
- Profile updates and a success dialog appears.

#### ACC-03: Phone length validation
Preconditions:
- User is on /account.
Steps:
1. Enter a phone number shorter than 10 digits.
2. Click Save profile.
Expected:
- Inline error appears and save is blocked.

#### ACC-04: Change password success
Preconditions:
- User has a valid old password.
Steps:
1. Enter old password and new password.
2. Submit.
Expected:
- Password change succeeds and fields reset.

#### ACC-05: Change password validation errors
Preconditions:
- User is on /account.
Steps:
1. Set new password equal to old password, or enter an incorrect old password.
2. Submit.
Expected:
- Error dialog shows a clear failure message.

#### ACC-06: Close settings with unsaved changes
Preconditions:
- User edits profile or password fields without saving.
Steps:
1. Click the close icon.
2. Confirm or cancel.
Expected:
- Confirming discards changes and returns to /.
- Cancel keeps the user on /account.

#### ACC-07: Clear conversation history
Preconditions:
- User has conversations saved.
Steps:
1. Click "Clear conversation history".
2. Confirm.
Expected:
- Conversations are deleted and status message shows success.

#### ACC-08: Sign out from account page
Preconditions:
- User is on /account.
Steps:
1. Click "Sign out".
Expected:
- User is redirected to /login and session is cleared.

#### ACC-09: Delete account
Preconditions:
- User is on /account.
Steps:
1. Click "Delete account".
2. Confirm deletion.
Expected:
- Account and conversations are removed.
- User is redirected to /login.

### Report problem dialog

#### REP-01: Open and close the dialog
Preconditions:
- User is logged in on /.
Steps:
1. Open the sidebar menu and click "Report a problem".
2. Close via Cancel, overlay click, and Escape.
Expected:
- Dialog opens and closes using all three methods.

#### REP-02: Submit with description only
Preconditions:
- SMTP is configured.
Steps:
1. Enter a description.
2. Submit the report.
Expected:
- Success dialog appears and form resets.

#### REP-03: Description required
Preconditions:
- Dialog is open.
Steps:
1. Leave description empty and submit.
Expected:
- Error message instructs to describe the issue.

#### REP-04: Attachment count limit
Preconditions:
- Dialog is open.
Steps:
1. Attach more than 5 files.
Expected:
- Error message indicates max 5 attachments.

#### REP-05: Attachment size limit
Preconditions:
- Dialog is open.
Steps:
1. Attach a file larger than the per-file limit.
Expected:
- Error message indicates the size limit and file is rejected.

#### REP-06: Remove attachment
Preconditions:
- One or more files are attached.
Steps:
1. Remove a file from the list.
Expected:
- File is removed from the UI and not sent.

#### REP-07: Transport not configured
Preconditions:
- SMTP is not configured.
Steps:
1. Submit a report.
Expected:
- API returns an error and the dialog shows a failure message.

### API integration and error handling

#### API-01: /models used by the model picker
Preconditions:
- API is running and has enabled model definitions.
Steps:
1. Load /.
Expected:
- Model picker options match /models response.

#### API-02: /chat SSE streaming
Preconditions:
- API is running.
Steps:
1. Send a chat message.
Expected:
- UI processes SSE chunks and completes on [DONE].

#### API-03: Rate limit errors
Preconditions:
- RATE_LIMIT_MAX is configured.
Steps:
1. Send more requests than the rate limit allows.
Expected:
- API returns 429 and UI shows a limit reached dialog.

#### API-04: Unauthorized profile fetch
Preconditions:
- Invalid or missing access token.
Steps:
1. Open /account.
Expected:
- User is redirected to /login.

#### API-05: Conversation size limits
Preconditions:
- User has a conversation with very long messages.
Steps:
1. Send a message longer than 4000 characters.
2. Reload the conversation.
Expected:
- Stored message is truncated to the server max length.

#### API-06: Report issue error handling
Preconditions:
- SMTP or transport errors are forced.
Steps:
1. Submit a report.
Expected:
- UI shows the API error message without crashing.

### Security and headers

#### SEC-01: CSP header
Preconditions:
- Web app running with middleware.
Steps:
1. Inspect response headers for any page.
Expected:
- Content-Security-Policy includes expected directives for connect-src and img-src.

#### SEC-02: Standard security headers
Preconditions:
- Web app running with middleware.
Steps:
1. Inspect response headers.
Expected:
- Referrer-Policy, X-Content-Type-Options, and X-Frame-Options are present.

#### SEC-03: Report issue sanitization
Preconditions:
- SMTP configured to send messages.
Steps:
1. Submit a report with HTML tags in description.
Expected:
- Email content escapes tags and does not render HTML.

### Performance and resilience

#### PERF-01: Provider timeout handling
Preconditions:
- Configure upstream to time out.
Steps:
1. Send a chat message.
Expected:
- UI shows an error dialog and remains responsive.

#### PERF-02: Large image payload rejection
Preconditions:
- Use an image that exceeds backend max size.
Steps:
1. Attach and send a large image.
Expected:
- API returns an error and UI shows a status dialog.

#### PERF-03: Rapid consecutive sends
Preconditions:
- User is on /.
Steps:
1. Click send multiple times quickly.
Expected:
- Duplicate messages are not created.

#### PERF-04: Offline or network failure
Preconditions:
- Simulate offline mode.
Steps:
1. Send a message.
Expected:
- UI shows an error dialog and does not crash.

### Accessibility

#### A11Y-01: Keyboard navigation on login
Preconditions:
- User is on /login.
Steps:
1. Use Tab to move through inputs and buttons.
Expected:
- Focus order is logical and all controls are reachable.

#### A11Y-02: Modal focus and escape
Preconditions:
- Open any confirm or status dialog.
Steps:
1. Observe focus on primary action.
2. Press Escape.
Expected:
- Focus moves to the primary button and Escape closes the dialog.

#### A11Y-03: Composer and controls have labels
Preconditions:
- User is on /.
Steps:
1. Inspect composer controls with a screen reader.
Expected:
- Send, stop, and attach buttons have descriptive labels.

#### A11Y-04: Sidebar menu roles
Preconditions:
- User is on /.
Steps:
1. Open the user menu in the sidebar.
2. Navigate with keyboard.
Expected:
- Menu items are focusable and actionable via keyboard.

### Responsive behavior

#### RESP-01: Mobile layout for chat
Preconditions:
- Use a narrow viewport (mobile).
Steps:
1. Open /.
2. Toggle sidebar and send a message.
Expected:
- Layout remains usable and composer stays visible.

#### RESP-02: Safe area handling
Preconditions:
- Test on a device with a bottom safe area (iOS).
Steps:
1. Open the composer.
Expected:
- Composer is not obscured by the safe area.

#### RESP-03: Report dialog on small screens
Preconditions:
- Open report dialog on a small viewport.
Steps:
1. Scroll within the dialog.
Expected:
- Dialog content is accessible without the body scrolling behind it.
