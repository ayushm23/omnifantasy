# OmniFantasy — System Architecture

Four focused diagrams, each covering a specific concern. Rendered natively on GitHub.

---

## 1 · Infrastructure Overview

Who talks to whom at the service level.

```mermaid
graph LR
    GitHub[GitHub\nSource Control] -->|auto-deploy on push| Vercel[Vercel CDN\nserves React app]
    Vercel -->|loads in| Browser[User Browser]
    Browser <-->|JS SDK| Supabase[Supabase\nAuth · DB · Realtime\nEdge Functions]
    Browser -->|fetch EP odds| OddsAPI[The Odds API]
    Browser -->|fetch results| ESPN[ESPN API]
    Browser -->|fetch F1 data| Jolpica[Jolpica API]
    Supabase -->|pg_cron every 1 min| EdgeFn[Edge Functions]
    EdgeFn -->|SMTP| Gmail[Gmail SMTP]
    Gmail -->|delivers| Inbox[User Inboxes]
```

---

## 2 · Frontend Layer

How the React app is structured internally.

```mermaid
graph TB
    App[omnifantasy-app.jsx\nGlobal state · routing · modals]

    App --> HomeV[Home View\nleague cards · invites\nYour Turn indicators]
    App --> LeagueV[LeagueView\nMy Roster · Standings\nBig Board · Draft Results]
    App --> DraftV[DraftView\nlive grid · EP display\nqueue · timer]

    App --> useAuth[useAuth\nsession state]
    App --> useLeagues[useLeagues\nleague CRUD]
    App --> useDraft[useDraft\npicks + draft_state]
    App --> useEP[useExpectedPoints\nEP per sport]
    App --> useResults[useResults\nfinal sport results]
    App --> useQueue[useDraftQueue\npick wishlist]
    App --> useAutoP[useAutoPickLogic\ntimer expiry · queue autopick]
    App --> useChat[useChatMessages\nleague chat]

    useLeagues --> supabaseClient[supabaseClient.js\nall DB read/write]
    useDraft --> supabaseClient
    useQueue --> supabaseClient
    useChat --> supabaseClient

    useEP --> oddsApi[oddsApi.js]
    useEP --> oddsScraper[oddsScraper.js\nF1 only]
    useResults --> resultsApi[resultsApi.js]
```

---

## 3 · Database Schema

Tables and their relationships.

```mermaid
erDiagram
    leagues {
        uuid id PK
        text name
        text commissioner_email
        text[] sports
        int draft_rounds
        text draft_timer
        int timer_pause_start_hour
        int timer_pause_end_hour
        text league_emoji
        bool draft_started
    }
    league_members {
        uuid id PK
        uuid league_id FK
        text email
        text name
        int draft_position
        text status
    }
    draft_picks {
        uuid id PK
        uuid league_id FK
        int pick_number
        int round
        text picker_email
        text sport
        text team
    }
    draft_state {
        uuid league_id PK
        int current_pick
        int current_round
        jsonb draft_order
        bool is_snake
        bool third_round_reversal
        bool draft_every_sport_required
        timestamptz pick_started_at
    }
    odds_cache {
        text sport_code PK
        jsonb data
        timestamptz updated_at
    }
    sport_results {
        text sport_code PK
        int season PK
        jsonb results
        timestamptz updated_at
    }
    draft_queue {
        uuid id PK
        uuid league_id FK
        text user_email
        text sport
        text team
        int position
    }
    ep_history {
        bigint id PK
        text sport_code
        jsonb snapshot_data
        timestamptz captured_at
    }
    league_chat {
        uuid id PK
        uuid league_id FK
        text user_email
        text message
        timestamptz created_at
    }
    draft_reminders {
        uuid league_id FK
        int pick_number
        text reminder_type
    }

    leagues ||--o{ league_members : "has members"
    leagues ||--o{ draft_picks : "has picks"
    leagues ||--|| draft_state : "has state"
    leagues ||--o{ draft_queue : "has queues"
    leagues ||--o{ league_chat : "has chat"
    leagues ||--o{ draft_reminders : "has reminders"
```

---

## 4 · Key Data Flows

The four main runtime flows end-to-end.

```mermaid
sequenceDiagram
    participant U as User Browser
    participant DB as Supabase DB
    participant RT as Supabase Realtime
    participant EF as Edge Function
    participant SMTP as Gmail SMTP
    participant Ext as External APIs

    Note over U,Ext: Flow A — Expected Points (EP)
    U->>DB: check odds_cache (sport_code)
    alt cache fresh < 2 days
        DB-->>U: return cached EP data
    else stale or missing
        U->>Ext: fetch from The Odds API / Jolpica
        Ext-->>U: raw odds
        U->>DB: write odds_cache + ep_history snapshot
        DB-->>U: cached EP data
    end

    Note over U,Ext: Flow B — Making a Pick
    U->>DB: INSERT draft_picks + UPDATE draft_state
    DB->>RT: broadcast state change
    RT-->>U: all connected clients refresh
    U->>EF: sendOtcEmail (1.5s delay)
    EF->>DB: read draft_state + leagues
    EF->>SMTP: send "You're on the clock" email
    SMTP-->>U: email delivered to next picker

    Note over U,Ext: Flow C — Sport Results & Standings
    U->>DB: check sport_results cache
    alt cache fresh
        DB-->>U: return cached results
    else stale
        U->>Ext: fetch ESPN brackets / Jolpica F1
        Ext-->>U: raw results
        U->>DB: write sport_results cache
        DB-->>U: results → calculatePickPoints() → standings
    end

    Note over U,Ext: Flow D — 1-Hour Reminder (server-side)
    EF->>DB: pg_cron fires every 1 min
    DB->>EF: active leagues with timers
    EF->>EF: computeTimeRemaining() pause-aware
    alt 60–76 min remaining + not already sent
        EF->>DB: INSERT draft_reminders (dedup)
        EF->>SMTP: send "1 hour left" email
    end
```
