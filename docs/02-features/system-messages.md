# System Messages

System messages allow administrators to broadcast announcements, alerts, or advertisements to users.

## Data Model

- **SystemMessage**: Represents a message with title, body, status (active/inactive), and optional target URL.
- **UserSystemMessageDismissal**: Tracks which messages a specific user has dismissed to prevent repeated displays.

## Management

- **Admin UI**: Accessible at `/admin/system-messages`.
- **API**: CRUD endpoints are located under `server/api/admin/system-messages`.

## Display

- **Component**: `SystemMessageCard.vue` on the user dashboard.
- **Filtering**: Only "active" messages that haven't been dismissed by the current user are displayed.
