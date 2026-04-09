# StayHaus — Phase 1 Spec: Onboarding → Notion

## What we're building
A single n8n workflow that:
1. Serves a client-facing onboarding form
2. On submit → auto-creates a Notion workspace from your existing template
3. Populates it with all submitted data
4. Notifies you (email/Slack) that a new client is ready

## The onboarding form fields

### Brand & Positioning
| # | Field | Type |
|---|-------|------|
| 1 | Brand name | Text |
| 2 | Brand overview | Long text — who they are, tone, what sets them apart |
| 3 | Customer insights | Long text — pains, desired outcomes, motivations |
| 4 | Desired outcome | Long text — what customers want to achieve |
| 5 | Why us | Long text — what customers say makes them choose you |
| 6 | Differentiation | Long text — what sets the product apart |
| 7 | USPs | Long text — concrete list |
| 8 | Hard-to-copy advantages | Long text — real moats |
| 9 | One-sentence pitch | Text |

### Access & Assets
| # | Field | Type |
|---|-------|------|
| A | Klaviyo API key | Text (sensitive) |
| B | Google Drive folder link | URL |
| C | Brand guidelines link/notes | Long text or URL |
| D | Product catalog / categories | Long text |
| E | Languages required | Multi-select: BG, RO, GR, HU |
| F | Approver name + email | Text |

## Architecture

```
[Client fills form] 
    → n8n webhook receives submission
    → n8n duplicates Notion template page
    → n8n populates all fields via Notion API
    → n8n stores Klaviyo API key (in Notion or separate vault)
    → n8n sends notification to Alex (email)
```

## Stack
- **n8n** — workflow orchestration (self-hosted or cloud)
- **Notion API** — template duplication + field population
- **n8n form trigger** — built-in form node, no external tool needed

## Build steps (in order)

### Step 1: Set up n8n
- Option A: n8n cloud (fastest, $20/mo) → sign up at n8n.io
- Option B: Self-host with Docker (free)

### Step 2: Set up Notion API
- Create a Notion integration at notion.so/my-integrations
- Get the API key
- Share your client template with the integration
- Get the template page ID

### Step 3: Build the n8n workflow
1. **Form Trigger node** — creates the onboarding form with all fields above
2. **Notion node** — duplicate the template page
3. **Notion node(s)** — populate each field with form data
4. **Email/Slack node** — notify Alex

### Step 4: Test with a dummy client
- Fill the form with test data
- Verify the Notion space is created and populated correctly
- Verify notification arrives

### Step 5: Send to first real client
- Share the form URL
- Monitor the first real submission
- Iterate based on feedback

## Open decisions
- Klaviyo API key storage: in a Notion property (simple) or a secrets manager (secure)? For now, Notion property with limited access is fine for 15 clients.
