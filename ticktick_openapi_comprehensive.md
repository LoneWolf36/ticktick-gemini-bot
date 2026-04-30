# TickTick Open API — Agent-Ready Reference

This document is a normalized reference for an LLM or coding agent. It removes most prose, groups the API surface by use case, and highlights the exact parameters, request shapes, response shapes, and quirks that matter during implementation.

## 1) Scope

This reference covers the documented TickTick Open API surface in the provided documentation:

- Authorization / OAuth 2.0
- Task endpoints
- Project endpoints
- Focus endpoints
- Habit endpoints
- Shared object definitions
- Known quirks and implementation notes

It is intended as a practical working reference for request generation and response parsing.

---

## 2) Base URLs

### OAuth
- Authorization: `https://ticktick.com/oauth/authorize`
- Token exchange: `https://ticktick.com/oauth/token`

### API
- Base API host: `https://api.ticktick.com`
- Open API base path: `/open/v1`

### Common request header
```http
Authorization: Bearer <access_token>
```

For JSON write requests:
```http
Content-Type: application/json
```

For token exchange:
```http
Content-Type: application/x-www-form-urlencoded
```

---

## 3) OAuth Authorization Flow

TickTick uses OAuth 2.0.

### Step 1 — Redirect the user to authorize
`GET https://ticktick.com/oauth/authorize`

Required query parameters:

| Name | Required | Description |
|---|---:|---|
| `client_id` | Yes | Application unique id |
| `scope` | Yes | Space-separated permission scope. Available: `tasks:write`, `tasks:read` |
| `state` | Yes | Passed to redirect URL as is |
| `redirect_uri` | Yes | User-configured redirect URL |
| `response_type` | Yes | Fixed value: `code` |

Example:
```text
https://ticktick.com/oauth/authorize?scope=tasks:read%20tasks:write&client_id=client_id&state=state&redirect_uri=redirect_uri&response_type=code
```

### Step 2 — Receive the callback
After approval, TickTick redirects to `redirect_uri` with:

| Name | Description |
|---|---|
| `code` | Authorization code for token exchange |
| `state` | Echo of the original state value |

### Step 3 — Exchange code for access token
`POST https://ticktick.com/oauth/token`

Form fields:

| Name | Required | Description |
|---|---:|---|
| `client_id` | Yes | Client id |
| `client_secret` | Yes | Client secret |
| `code` | Yes | Authorization code from step 2 |
| `grant_type` | Yes | Must be `authorization_code` |
| `scope` | Yes | Space-separated permission scope |
| `redirect_uri` | Yes | Must match the configured redirect URL |

Example response:
```json
{
  "access_token": "access token value"
}
```

### Step 4 — Call the API
Use:
```http
Authorization: Bearer <access_token>
```

---

## 4) Global Data Conventions

### Timestamp format
Use:
`yyyy-MM-dd'T'HH:mm:ssZ`

Example:
`2019-11-13T03:00:00+0000`

### Date stamp format
Use:
`YYYYMMDD`

Example:
`20260407`

### Task status
| Value | Meaning |
|---|---|
| `0` | Normal/open |
| `2` | Completed |

### Checklist item status
| Value | Meaning |
|---|---|
| `0` | Normal/open |
| `1` | Completed |

### Priority
| Value | Meaning |
|---|---|
| `0` | None |
| `1` | Low |
| `3` | Medium |
| `5` | High |

### Project kinds
| Value | Meaning |
|---|---|
| `TASK` | Task project |
| `NOTE` | Note project |

### Project view modes
| Value | Meaning |
|---|---|
| `list` | List view |
| `kanban` | Kanban view |
| `timeline` | Timeline view |

### Focus types
| Value | Meaning |
|---|---|
| `0` | Pomodoro |
| `1` | Timing |

---

## 5) Endpoint Index

Use this as the first lookup table for a coding agent.

| Area | Method | Path | Purpose |
|---|---|---|---|
| Task | GET | `/open/v1/project/{projectId}/task/{taskId}` | Get one task |
| Task | POST | `/open/v1/task` | Create task |
| Task | POST | `/open/v1/task/{taskId}` | Update task |
| Task | POST | `/open/v1/project/{projectId}/task/{taskId}/complete` | Complete task |
| Task | DELETE | `/open/v1/project/{projectId}/task/{taskId}` | Delete task |
| Task | POST | `/open/v1/task/move` | Move task(s) between projects |
| Task | POST | `/open/v1/task/completed` | List completed tasks |
| Task | POST | `/open/v1/task/filter` | Filter tasks |
| Project | GET | `/open/v1/project` | List projects |
| Project | GET | `/open/v1/project/{projectId}` | Get one project |
| Project | GET | `/open/v1/project/{projectId}/data` | Get project with tasks and columns |
| Project | POST | `/open/v1/project` | Create project |
| Project | POST | `/open/v1/project/{projectId}` | Update project |
| Project | DELETE | `/open/v1/project/{projectId}` | Delete project |
| Focus | GET | `/open/v1/focus/{focusId}` | Get one focus record |
| Focus | GET | `/open/v1/focus` | Get focus records in time range |
| Focus | DELETE | `/open/v1/focus/{focusId}` | Delete focus record |
| Habit | GET | `/open/v1/habit/{habitId}` | Get one habit |
| Habit | GET | `/open/v1/habit` | List habits |
| Habit | POST | `/open/v1/habit` | Create habit |
| Habit | POST | `/open/v1/habit/{habitId}` | Update habit |
| Habit | POST | `/open/v1/habit/{habitId}/checkin` | Create or update check-in |
| Habit | GET | `/open/v1/habit/checkins` | Get habit check-ins |

---

## 6) Task API

### 6.1 Get Task By Project ID And Task ID
`GET /open/v1/project/{projectId}/task/{taskId}`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `projectId` | Yes | Project identifier |
| `taskId` | Yes | Task identifier |

#### Returns
`Task`

#### Minimal request
```http
GET /open/v1/project/{{projectId}}/task/{{taskId}} HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

#### Response shape
Typical fields:
- `id`
- `projectId`
- `title`
- `content`
- `desc`
- `isAllDay`
- `startDate`
- `dueDate`
- `timeZone`
- `reminders`
- `repeatFlag`
- `priority`
- `status`
- `completedTime`
- `sortOrder`
- `items`
- `kind`

---

### 6.2 Create Task
`POST /open/v1/task`

#### Required body fields
| Name | Required | Description |
|---|---:|---|
| `title` | Yes | Task title |
| `projectId` | Yes | Project id |

#### Optional body fields
| Name | Description |
|---|---|
| `content` | Task content |
| `desc` | Description of checklist |
| `isAllDay` | All day |
| `startDate` | Start date/time |
| `dueDate` | Due date/time |
| `timeZone` | Time zone |
| `reminders` | Reminder triggers |
| `repeatFlag` | Recurring rule |
| `priority` | Task priority |
| `sortOrder` | Task sort order |
| `items` | Subtasks |

#### Subtask fields inside `items`
| Name | Description |
|---|---|
| `title` | Subtask title |
| `startDate` | Start date/time |
| `isAllDay` | All day |
| `sortOrder` | Subtask order |
| `timeZone` | Subtask timezone |
| `status` | Completion status |
| `completedTime` | Completed time |

#### Minimal request
```http
POST /open/v1/task HTTP/1.1
Host: api.ticktick.com
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "title": "Task Title",
  "projectId": "6226ff9877acee87727f6bca"
}
```

#### Response
Returns `Task`.

---

### 6.3 Update Task
`POST /open/v1/task/{taskId}`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `taskId` | Yes | Task identifier |

#### Required body fields
| Name | Required | Description |
|---|---:|---|
| `id` | Yes | Task id |
| `projectId` | Yes | Project id |

#### Optional body fields
Same as create task:
- `title`
- `content`
- `desc`
- `isAllDay`
- `startDate`
- `dueDate`
- `timeZone`
- `reminders`
- `repeatFlag`
- `priority`
- `sortOrder`
- `items`

#### Minimal request
```http
POST /open/v1/task/{{taskId}} HTTP/1.1
Host: api.ticktick.com
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "id": "{{taskId}}",
  "projectId": "{{projectId}}"
}
```

#### Response
Returns `Task`.

---

### 6.4 Complete Task
`POST /open/v1/project/{projectId}/task/{taskId}/complete`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `projectId` | Yes | Project identifier |
| `taskId` | Yes | Task identifier |

#### Body
No body shown in the documentation.

#### Minimal request
```http
POST /open/v1/project/{{projectId}}/task/{{taskId}}/complete HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

#### Response
No content.

---

### 6.5 Delete Task
`DELETE /open/v1/project/{projectId}/task/{taskId}`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `projectId` | Yes | Project identifier |
| `taskId` | Yes | Task identifier |

#### Minimal request
```http
DELETE /open/v1/project/{{projectId}}/task/{{taskId}} HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

#### Response
No content.

---

### 6.6 Move Task
`POST /open/v1/task/move`

Moves one or more tasks between projects.

#### Body
Array of move objects.

| Name | Required | Description |
|---|---:|---|
| `fromProjectId` | Yes | Source project id |
| `toProjectId` | Yes | Destination project id |
| `taskId` | Yes | Task id |

#### Minimal request
```http
POST /open/v1/task/move HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}

[
  {
    "fromProjectId": "69a850ef1c20d2030e148fdd",
    "toProjectId": "69a850f41c20d2030e148fdf",
    "taskId": "69a850f8b9061f374d54a046"
  }
]
```

#### Response
Array of move results, each including:
- `id`
- `etag`

---

### 6.7 List Completed Tasks
`POST /open/v1/task/completed`

Retrieves tasks completed within specific projects and a time range.

#### Body
| Name | Required | Description |
|---|---:|---|
| `projectIds` | Optional | List of project ids |
| `startDate` | Optional | Inclusive lower bound on `completedTime` |
| `endDate` | Optional | Inclusive upper bound on `completedTime` |

#### Minimal request
```http
POST /open/v1/task/completed HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}

{
  "projectIds": [
    "69a850f41c20d2030e148fdf"
  ],
  "startDate": "2026-03-01T00:58:20.000+0000",
  "endDate": "2026-03-05T10:58:20.000+0000"
}
```

#### Response
Array of `Task`.

---

### 6.8 Filter Tasks
`POST /open/v1/task/filter`

Retrieves tasks using advanced filtering.

#### Body
| Name | Required | Description |
|---|---:|---|
| `projectIds` | Optional | Filter by project ids |
| `startDate` | Optional | Filter by task `startDate >= startDate` |
| `endDate` | Optional | Filter by task `startDate <= endDate` |
| `proiority` | Optional | Priority filter. The documentation contains a typo here; see quirks section |
| `tag` | Optional | Tasks containing all specified tags |
| `status` | Optional | Filter by status codes |

#### Example from docs
```http
POST /open/v1/task/filter HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}

{
  "projectIds": [
    "69a850f41c20d2030e148fdf"
  ],
  "startDate": "2026-03-01T00:58:20.000+0000",
  "endDate": "2026-03-06T10:58:20.000+0000",
  "priority": [0],
  "tag": ["urgent"],
  "status": [0]
}
```

#### Response
Array of `Task`.

---

## 7) Project API

### 7.1 Get User Project
`GET /open/v1/project`

#### Returns
Array of `Project`.

#### Minimal request
```http
GET /open/v1/project HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

---

### 7.2 Get Project By ID
`GET /open/v1/project/{projectId}`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `projectId` | Yes | Project identifier |

#### Returns
`Project`

#### Minimal request
```http
GET /open/v1/project/{{projectId}} HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

---

### 7.3 Get Project With Data
`GET /open/v1/project/{projectId}/data`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `projectId` | Yes | Project identifier |

#### Returns
`ProjectData`

#### Minimal request
```http
GET /open/v1/project/{{projectId}}/data HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

#### Notes
- `tasks` in `ProjectData` are the undone tasks under the project.
- `columns` are only relevant for kanban-style projects.

---

### 7.4 Create Project
`POST /open/v1/project`

#### Required body fields
| Name | Required | Description |
|---|---:|---|
| `name` | Yes | Project name |

#### Optional body fields
- `color`
- `sortOrder`
- `viewMode`
- `kind`

#### Minimal request
```http
POST /open/v1/project HTTP/1.1
Host: api.ticktick.com
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "project name",
  "color": "#F18181",
  "viewMode": "list",
  "kind": "TASK"
}
```

#### Response
Returns `Project`.

---

### 7.5 Update Project
`POST /open/v1/project/{projectId}`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `projectId` | Yes | Project identifier |

#### Optional body fields
- `name`
- `color`
- `sortOrder`
- `viewMode`
- `kind`

#### Minimal request
```http
POST /open/v1/project/{{projectId}} HTTP/1.1
Host: api.ticktick.com
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "Project Name",
  "color": "#F18181",
  "viewMode": "list",
  "kind": "TASK"
}
```

#### Response
Returns `Project`.

---

### 7.6 Delete Project
`DELETE /open/v1/project/{projectId}`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `projectId` | Yes | Project identifier |

#### Minimal request
```http
DELETE /open/v1/project/{{projectId}} HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

---

## 8) Focus API

### 8.1 Get Focus By Focus ID
`GET /open/v1/focus/{focusId}`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `focusId` | Yes | Focus identifier |

#### Query parameters
| Name | Required | Description |
|---|---:|---|
| `type` | Yes | Focus type: `0` Pomodoro, `1` Timing |

#### Returns
`OpenFocus`

#### Minimal request
```http
GET /open/v1/focus/{{focusId}}?type=0 HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

---

### 8.2 Get Focuses By Time Range
`GET /open/v1/focus`

#### Query parameters
| Name | Required | Description |
|---|---:|---|
| `from` | Yes | Start time in `yyyy-MM-dd'T'HH:mm:ssZ` |
| `to` | Yes | End time in `yyyy-MM-dd'T'HH:mm:ssZ` |
| `type` | Yes | Focus type: `0` Pomodoro, `1` Timing |

#### Important behavior
If the requested range exceeds 30 days, the server adjusts the start time to 30 days before `to`.

#### Returns
Array of `OpenFocus`.

#### Minimal request
```http
GET /open/v1/focus?from=2026-04-01T00:00:00+0800&to=2026-04-02T00:00:00+0800&type=1 HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

---

### 8.3 Delete Focus
`DELETE /open/v1/focus/{focusId}`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `focusId` | Yes | Focus identifier |

#### Query parameters
| Name | Required | Description |
|---|---:|---|
| `type` | Yes | Focus type: `0` Pomodoro, `1` Timing |

#### Returns
`OpenFocus`

#### Minimal request
```http
DELETE /open/v1/focus/{{focusId}}?type=0 HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

---

## 9) Habit API

### 9.1 Get Habit By Habit ID
`GET /open/v1/habit/{habitId}`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `habitId` | Yes | Habit identifier |

#### Returns
`OpenHabit`

#### Minimal request
```http
GET /open/v1/habit/{{habitId}} HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

---

### 9.2 Get All Habits
`GET /open/v1/habit`

#### Returns
Array of `OpenHabit`.

#### Minimal request
```http
GET /open/v1/habit HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

---

### 9.3 Create Habit
`POST /open/v1/habit`

#### Required body fields
| Name | Required | Description |
|---|---:|---|
| `name` | Yes | Habit name |

#### Optional body fields
- `iconRes`
- `color`
- `sortOrder`
- `status`
- `encouragement`
- `type`
- `goal`
- `step`
- `unit`
- `repeatRule`
- `reminders`
- `recordEnable`
- `sectionId`
- `targetDays`
- `targetStartDate`
- `completedCycles`
- `exDates`
- `style`

#### Minimal request
```http
POST /open/v1/habit HTTP/1.1
Host: api.ticktick.com
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "Read",
  "iconRes": "habit_reading",
  "color": "#4D8CF5",
  "type": "Boolean",
  "goal": 1.0,
  "step": 1.0,
  "unit": "Count",
  "repeatRule": "RRULE:FREQ=DAILY;INTERVAL=1",
  "recordEnable": false
}
```

#### Returns
`OpenHabit`

---

### 9.4 Update Habit
`POST /open/v1/habit/{habitId}`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `habitId` | Yes | Habit identifier |

#### Optional body fields
Same as create habit.

#### Minimal request
```http
POST /open/v1/habit/{{habitId}} HTTP/1.1
Host: api.ticktick.com
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "Read more",
  "goal": 2.0,
  "repeatRule": "RRULE:FREQ=DAILY;INTERVAL=1"
}
```

#### Returns
`OpenHabit`

---

### 9.5 Create Or Update Habit Check-In
`POST /open/v1/habit/{habitId}/checkin`

#### Path parameters
| Name | Required | Description |
|---|---:|---|
| `habitId` | Yes | Habit identifier |

#### Required body fields
| Name | Required | Description |
|---|---:|---|
| `stamp` | Yes | Date stamp in `YYYYMMDD` format |

#### Optional body fields
- `time`
- `opTime`
- `value`
- `goal`
- `status`

#### Minimal request
```http
POST /open/v1/habit/{{habitId}}/checkin HTTP/1.1
Host: api.ticktick.com
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "stamp": 20260407,
  "value": 1.0,
  "goal": 1.0
}
```

#### Returns
`OpenHabitCheckin`

---

### 9.6 Get Habit Check-Ins
`GET /open/v1/habit/checkins`

#### Query parameters
| Name | Required | Description |
|---|---:|---|
| `habitIds` | Yes | Habit ids separated by commas |
| `from` | Yes | Start date stamp in `YYYYMMDD` format |
| `to` | Yes | End date stamp in `YYYYMMDD` format |

#### Returns
Array of `OpenHabitCheckin`.

#### Minimal request
```http
GET /open/v1/habit/checkins?habitIds=habit-1,habit-2&from=20260401&to=20260407 HTTP/1.1
Host: api.ticktick.com
Authorization: Bearer {{token}}
```

---

## 10) Definitions

### 10.1 ChecklistItem
| Field | Meaning | Type |
|---|---|---|
| `id` | Subtask identifier | string |
| `title` | Subtask title | string |
| `status` | Normal `0`, Completed `1` | integer |
| `completedTime` | Completion time | date-time string |
| `isAllDay` | All day | boolean |
| `sortOrder` | Subtask order | integer |
| `startDate` | Start time | date-time string |
| `timeZone` | Time zone | string |

### 10.2 Task
| Field | Meaning | Type |
|---|---|---|
| `id` | Task identifier | string |
| `projectId` | Project id | string |
| `title` | Task title | string |
| `isAllDay` | All day | boolean |
| `completedTime` | Completion time | date-time string |
| `content` | Task content | string |
| `desc` | Task description | string |
| `dueDate` | Due date | date-time string |
| `items` | Subtasks | array of `ChecklistItem` |
| `priority` | Priority (`0`, `1`, `3`, `5`) | integer |
| `reminders` | Reminder triggers | array of string |
| `repeatFlag` | Recurring rule | string |
| `sortOrder` | Task order | integer |
| `startDate` | Start time | date-time string |
| `status` | Normal `0`, Completed `2` | integer |
| `timeZone` | Time zone | string |
| `kind` | `TEXT`, `NOTE`, `CHECKLIST` | string |

### 10.3 Project
| Field | Meaning | Type |
|---|---|---|
| `id` | Project identifier | string |
| `name` | Project name | string |
| `color` | Project color | string |
| `sortOrder` | Order value | integer |
| `closed` | Project closed flag | boolean |
| `groupId` | Project group id | string |
| `viewMode` | `list`, `kanban`, `timeline` | string |
| `permission` | `read`, `write`, `comment` | string |
| `kind` | `TASK` or `NOTE` | string |

### 10.4 Column
| Field | Meaning | Type |
|---|---|---|
| `id` | Column identifier | string |
| `projectId` | Project identifier | string |
| `name` | Column name | string |
| `sortOrder` | Order value | integer |

### 10.5 ProjectData
| Field | Meaning | Type |
|---|---|---|
| `project` | Project info | `Project` |
| `tasks` | Undone tasks under project | array of `Task` |
| `columns` | Columns under project | array of `Column` |

### 10.6 OpenPomodoroTaskBrief
| Field | Meaning | Type |
|---|---|---|
| `taskId` | Task id | string |
| `title` | Task title | string |
| `habitId` | Habit id | string |
| `timerId` | Timer id | string |
| `timerName` | Timer name | string |
| `startTime` | Focus start time | date-time string |
| `endTime` | Focus end time | date-time string |

### 10.7 OpenFocus
| Field | Meaning | Type |
|---|---|---|
| `id` | Focus unique id | string |
| `userId` | User id | integer |
| `type` | Focus type (`0`, `1`) | integer |
| `taskId` | Task id | string |
| `note` | Focus note | string |
| `tasks` | Related task briefs | array of `OpenPomodoroTaskBrief` |
| `status` | Pomodoro status | integer |
| `startTime` | Focus start time | date-time string |
| `endTime` | Focus end time | date-time string |
| `pauseDuration` | Pause duration in seconds | integer |
| `adjustTime` | Adjusted time in seconds | integer |
| `added` | Whether record was added | boolean |
| `createdTime` | Created time | date-time string |
| `modifiedTime` | Modified time | date-time string |
| `etimestamp` | Entity timestamp | integer |
| `etag` | Entity tag | string |
| `duration` | Focus duration | integer |
| `relationType` | Relation types | array of integer |

### 10.8 OpenHabit
| Field | Meaning | Type |
|---|---|---|
| `id` | Habit unique id | string |
| `name` | Habit name | string |
| `iconRes` | Habit icon resource | string |
| `color` | Habit color | string |
| `sortOrder` | Habit sort order | integer |
| `status` | Habit status | integer |
| `encouragement` | Habit encouragement message | string |
| `totalCheckIns` | Total check-ins | integer |
| `createdTime` | Created time | date-time string |
| `modifiedTime` | Modified time | date-time string |
| `archivedTime` | Archived time | date-time string |
| `type` | Habit type | string |
| `goal` | Habit goal | number |
| `step` | Habit step | number |
| `unit` | Habit unit | string |
| `etag` | Habit etag | string |
| `repeatRule` | Habit repeat rule | string |
| `reminders` | Habit reminders | array of string |
| `recordEnable` | Whether record is enabled | boolean |
| `sectionId` | Habit section identifier | string |
| `targetDays` | Target days | integer |
| `targetStartDate` | Target start date | integer |
| `completedCycles` | Completed cycles | integer |
| `exDates` | Excluded dates | array of string |
| `style` | Habit style | integer |

### 10.9 OpenHabitCheckinData
| Field | Meaning | Type |
|---|---|---|
| `id` | Check-in id | string |
| `stamp` | Date stamp | integer |
| `time` | Check-in time | date-time string |
| `opTime` | Operation time | date-time string |
| `value` | Check-in value | number |
| `goal` | Check-in goal | number |
| `status` | Check-in status | integer |

### 10.10 OpenHabitCheckin
| Field | Meaning | Type |
|---|---|---|
| `id` | Check-in document id | string |
| `habitId` | Habit id | string |
| `createdTime` | Created time | date-time string |
| `modifiedTime` | Modified time | date-time string |
| `etag` | Check-in etag | string |
| `year` | Year | integer |
| `checkins` | Check-in entries | array of `OpenHabitCheckinData` |

---

## 11) Known Quirks and Implementation Notes

These are the details that matter most for an LLM generating correct code.

1. **Updates use `POST`**, not `PUT`, for both tasks and projects.
2. **Create task** requires `title` and `projectId`.
3. **Update task** requires `id` and `projectId`.
4. **Project create** examples sometimes show `"kind": "task"` in lowercase, but the definition says the value should be uppercase `TASK` or `NOTE`. Prefer uppercase.
5. **Task filter docs contain a typo**: the parameter is shown as `proiority` in the table, but the example body uses `priority`. Treat this as a documentation typo and prefer `priority`.
6. **Completed tasks** are fetched with `POST /open/v1/task/completed`, not through the project data endpoint.
7. **Project data** returns undone tasks and columns, not a global task search.
8. **Focus endpoints** require `type` in both GET and DELETE calls.
9. **Focus time range** is limited to 30 days; the server may adjust the lower bound.
10. **Task status** and **subtask status** use different completed values:
   - Task: `2`
   - Subtask: `1`
11. The docs show `kind` on tasks with values like `TEXT`, `NOTE`, `CHECKLIST`.
12. Many endpoints return `200` with an object/array and also list `201 Created`; in practice, the return body may be present on `200`.
13. For safe agent behavior, prefer sending only the fields you need plus all required fields.

---

## 12) Recommended Request Strategy for a Coding Agent

When building code against this API, follow this order:

1. Authenticate with OAuth and store the bearer token.
2. List projects with `GET /open/v1/project`.
3. Use `GET /open/v1/project/{projectId}/data` to obtain the project snapshot.
4. Use task read/write endpoints for task lifecycle actions.
5. Use completed-task and filter endpoints for retrieval logic.
6. Use habit and focus endpoints only when needed.
7. Parse dates as strings in the documented format; do not assume ISO-8601 with colonized timezone unless your serializer can emit the exact TickTick format.

---

## 13) Minimal Payload Cheat Sheet

### Create task
```json
{
  "title": "Task Title",
  "projectId": "project-id"
}
```

### Update task
```json
{
  "id": "task-id",
  "projectId": "project-id"
}
```

### Create project
```json
{
  "name": "Project Name",
  "color": "#F18181",
  "viewMode": "list",
  "kind": "TASK"
}
```

### Create habit
```json
{
  "name": "Habit Name",
  "repeatRule": "RRULE:FREQ=DAILY;INTERVAL=1"
}
```

### Create habit check-in
```json
{
  "stamp": 20260407,
  "value": 1.0,
  "goal": 1.0
}
```

---

## 14) Support

For questions or feedback regarding the TickTick Open API documentation:

`support@ticktick.com`