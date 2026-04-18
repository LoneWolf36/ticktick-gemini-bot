# Master Product Vision and Behavioral Scope

## Purpose

This product begins as a personal tool for one user and may later evolve into a multi-user SaaS if it proves genuinely effective. Its purpose is not to become another task manager. Its purpose is to help the user consistently move toward important long-term goals by reducing procrastination, improving task clarity, improving prioritization, and gently rewiring unhelpful behavioral patterns over time.

The product should feel like a hybrid of:

* a coach that guides the user,
* an operator that helps manage and refine tasks,
* and a mirror that reflects patterns and truth.

Its core value is not task storage. Its core value is better judgment.

---

## What This Product Is Trying to Fix

TickTick already allows task creation and organization. The problem is not simply task availability. The problem is that the user still has to do the mental work of:

* deciding what matters,
* turning vague intentions into actionable work,
* prioritizing correctly,
* avoiding low-value busywork,
* and staying aligned with long-term goals.

The product exists because the user has used TickTick for years but still struggles to use it effectively in practice. The system should help reduce the gap between having tasks and actually making meaningful progress.

The product must help the user:

* stop mistaking motion for progress,
* stop over-planning as a form of avoidance,
* stop focusing on low-priority tasks that feel productive,
* and keep returning to what actually matters.

---

## Product Identity

The product is a behavioral support system for task execution.

It should not feel like:

* a passive list manager,
* a generic reminder app,
* or a system that blindly accepts the user’s first input as correct.

It should feel like:

* a trusted assistant that understands the user over time,
* a coach that is willing to be assertive when needed,
* and a system that knows when to challenge the user and when to step back.

---

## Scope of the First Version

The first version is a polished personal assistant that helps the user manage tasks more effectively and address procrastination and prioritization problems. It is not initially focused on auth, billing, rate limiting, or full multi-tenant SaaS design.

The scope should stay tightly locked so the system can be tested quickly in the real world. Future expansion is possible only if the system truly proves that it helps the user:

* manage TickTick better,
* stay on top of priorities,
* reduce procrastination,
* and improve habits without judgment.

---

## Product Philosophy

The product must follow these principles:

1. Correctness matters more than confidence.
   If the system is unsure what matters most, it should not pretend certainty.

2. Wrong tasks are worse than fewer tasks.
   A small number of correct tasks is better than a long list of misplaced tasks.

3. The system should optimize for behavior change, not just organization.
   Organizing tasks without improving follow-through is a failure.

4. The system should be adaptive.
   It should learn from repeated behavior, patterns, and outcomes.

5. The system should be assertive only when justified.
   Strong guidance is useful when the system has high confidence.

6. The system should be collaborative when uncertain.
   If it may be wrong, it should ask directly rather than repeatedly push bad guidance.

7. The product must remain cognitively light.
   It should reduce mental load, not add to it.

---

## How the System Should Behave

### 1. Morning Start

The user opens Telegram in the morning.

The system should begin with a quick check, not an interrogation. It should ask a few targeted questions to understand:

* current energy,
* current constraints,
* and current intent.

The interaction should be short, light, and focused. The goal is to help the user get oriented without wasting attention.

The system should then produce a clear plan for the day.

The user does not want verbosity. The user wants something that is easy to read, easy to trust, and easy to act on.

---

### 2. Daily Plan

The system should typically surface no more than three tasks for the day.

Those tasks must be:

* actually important,
* doable,
* and at least one should be aligned with long-term goals.

The system must not present tasks that are vague, inflated, or simply busywork disguised as progress.

The system should help the user see the difference between:

* work that advances the goal,
* and work that only creates the feeling of being busy.

---

### 3. During the Day

The user may procrastinate by:

* switching tasks,
* over-planning,
* doing non-essential tasks,
* learning random things,
* or mentally hiding inside the comfort of preparation.

The system should detect these patterns over time.

Intervention should be gradual:

* silent nudges at first,
* direct call-outs when a pattern is repeating,
* strict commands only in urgent mode.

The system should not constantly interrupt the user. It should intervene when a meaningful pattern is detected.

---

### 4. Task Completion

When a task is completed, the system should provide either:

* a small reinforcement,
* or a short insight about why the completed task mattered.

The purpose is not cheerleading. The purpose is to help the user build better internal patterns over time.

The system should not reshuffle the entire day immediately after each completion unless that is clearly needed.

---

### 5. End of Day

At the end of the day, the system should provide a brief reflection and lightweight stats.

The end-of-day interaction should be short, around one to two minutes.

The tone should change based on context:

* gentle when the user is doing well,
* balanced when the situation is neutral,
* more direct when the user has clearly been avoiding important work.

The system should not punish the user for irregular use. The user may travel, attend events, or skip interaction on some days. The system should remain useful without relying on perfect daily consistency.

---

## Prioritization Behavior

Prioritization is one of the core things the system must do well.

The system should help the user:

* identify what matters most,
* distinguish important work from low-value activity,
* break down vague tasks into more actionable forms,
* and reprioritize or deprioritize items when needed.

If the system has high confidence, it may be assertive.

If the system has low confidence, it must be collaborative.

This means the system should:

* ask directly when it is unsure,
* learn from the answer,
* and reduce unnecessary questioning over time.

The system should never keep pushing wrong priorities repeatedly. That would damage trust and make the product feel unhelpful.

---

## Urgent Mode

Urgent mode should be used when:

* the user is overwhelmed and needs immediate clarity,
* the user has limited time and needs to know what matters most right now,
* or when the system detects a high-confidence situation that requires stronger intervention.

Urgent mode can be:

* invoked by the user, or
* triggered by the system when context strongly justifies escalation.

Urgent mode should be:

* minimal,
* direct,
* action-oriented,
* and more assertive than the normal mode.

It should not be the default. It should be reserved for moments where the system needs to cut through confusion and provide clear direction.

Urgent mode is a temporary escalation state, not a permanent mode.

The system should return to normal behavior when:

* the urgent condition is resolved,
* the user regains clarity,
* or the system determines that lighter guidance is sufficient.

---

## Behavioral Intelligence

The system should notice patterns that contribute to procrastination and misalignment with long-term goals.

Examples of patterns it may detect include:

* repeated postponement,
* task switching,
* over-planning,
* busywork replacing important work,
* or creating ambitious plans without execution.

The user is okay with the system noticing these patterns even if it feels intrusive. The value of improved behavior is more important than avoiding discomfort.

The system should still use judgment:

* if confidence is high, it can be direct,
* if confidence is low, it should ask,
* and if repeated guidance is not helping, it should adjust its interaction style or intervention level.

The system may change its interaction style, tone, and intervention level, but it must not change the product’s purpose or underlying goal.

---

## What Happens When the System Is Unsure

If the system is unsure what matters:

* it should ask directly,
* then learn from the answer,
* and reduce questioning over time.

It should not continue pretending certainty.

If the system keeps giving wrong suggestions, the user will stop trusting it.

The system should treat uncertainty as a reason to clarify, not as a reason to guess aggressively.

---

## What Happens When the User Ignores It

If the user repeatedly ignores the system, the system should not become noisy or stubborn.

It should either:

* back off,
* or temporarily adjust its interaction style.

This may include:

* simplifying the output,
* reducing the number of tasks shown (without deleting tasks),
* lowering the level of intervention,
* or changing how guidance is presented.

When the system shows fewer tasks, it is surfacing a smaller active set, not deleting tasks unless explicitly instructed.

Temporary adjustments last only until:

* the user re-engages,
* the system regains confidence,
* or the context improves.

The system should adapt instead of escalating blindly.

---

## What the System Must Feel Like

The system should feel like:

* a coach who wants the user to improve,
* an operator that helps clean up and manage tasks,
* and a mirror that shows patterns clearly.

It should not feel like a judgmental boss.

It should also not feel like a passive record keeper.

It should feel intelligent, adaptive, and grounded in the user’s actual behavior.

---

## What Success Looks Like

Success is not merely that the user has a better organized task list.

Success is that the user:

* does the right work more often,
* wastes less time on low-value activity,
* feels less trapped in task chaos,
* and builds better habits over time.

The product should help the user move the needle consistently.

---

## Biggest Failure Mode

The biggest failure would be a system that misunderstands what actually matters.

That failure would show up as:

* wrong task selection,
* wrong prioritization,
* too much confidence in the wrong direction,
* or repeated guidance that does not reflect the user’s real priorities.

That is worse than being slightly less assertive.

---

## Edge Cases the Product Must Handle

### 1. User is blank in the morning

The system should use a light check and help the user get oriented without overwhelming them.

### 2. User is motivated but scattered

The system should help separate useful momentum from fake productivity.

### 3. User is overwhelmed

The system should reduce choices and give a short, clear focus.

### 4. User has limited time

The system should switch to urgent mode and identify the most important action.

### 5. User is traveling or socially occupied

The system should not punish inconsistency. It should remain useful without demanding perfect habits.

### 6. User keeps postponing an important task

The system should notice the pattern and escalate guidance gradually.

### 7. User creates vague tasks

The system should ask clarifying questions or turn them into actionable forms.

### 8. User is doing lots of small tasks instead of one important task

The system should recognize the avoidance pattern and redirect attention.

### 9. System confidence is low

The system should ask the user directly rather than forcing a possibly wrong direction.

### 10. System confidence is high

The system can be more assertive and directive.

### 11. User repeatedly ignores guidance

The system should back off or adjust its interaction style without becoming intrusive.

### 12. End-of-day review feels irrelevant

The system should keep it brief and context-aware rather than forcing a rigid format.

---

## Non-Goals for the First Version

The first version should not try to solve everything.

It should not over-focus on:

* full SaaS infrastructure,
* billing,
* auth,
* rate limiting,
* or overly complex engineering abstractions.

It should stay centered on the actual human problem:

> helping the user consistently identify, prioritize, and execute the work that actually matters.

---

## Final Product Statement

This product is a task-and-behavior support system that helps the user prioritize better, procrastinate less, and move consistently toward long-term goals.

It should be:

* clear,
* adaptive,
* minimally verbose,
* behavior-aware,
* and honest about uncertainty.

It must not simply organize tasks.
It must improve the user’s ability to act on what matters.
