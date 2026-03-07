# cc-personality

**What kind of Claude Code developer are you?**

Diagnoses your coding archetype from real usage patterns in your session logs.

**Try it in your browser:** [yurukusa.github.io/cc-personality](https://yurukusa.github.io/cc-personality/)

```
npx cc-personality
```

Zero dependencies. Reads `~/.claude/projects/` locally. Nothing sent anywhere.

---

## Your archetype could be...

| Archetype | Trigger |
|-----------|---------|
| 🌙 The Midnight Beast | 30%+ of sessions between midnight and 5 AM |
| 🌅 The Dawn Coder | 40%+ sessions in early morning (5-9 AM) |
| 🤖 The Unstoppable Machine | 30+ consecutive active days |
| ⚔️ The Weekend Warrior | Weekend sessions 1.8x more than weekdays |
| ⚡ The Burst Genius | Lots of inactive days + intense bursts |
| 📐 The Disciplined Architect | Consistent daily usage without burnout |
| 🔥 The Session Monster | Average session over 2.5 hours |
| 📦 The Micro-Shipper | 15+ sessions per active day |
| 🗺️ The Code Explorer | Active across 20+ different projects |
| 🎯 The Mono-Focused | 100+ sessions, 3 or fewer projects |

---

## Sample output

```
╔════════════════════════════════════════════════════╗
║  YOUR CLAUDE CODE DEVELOPER ARCHETYPE              ║
╚════════════════════════════════════════════════════╝

  🌙 The Midnight Beast
  「深夜の怪物」

  "The compiler doesn't sleep, and neither do I."

  Your code runs on moonlight and caffeine. Peak hours: 0-5 AM.

──────────────────────────────────────────────────────
  Your data:
  ⏱  116h total  •  3,485 sessions  •  47 active days
  🔥 Longest streak: 35 days
  📊 Avg session: 120 min

  Activity by hour (0h → 23h):
  ▆▃▆▁▁▁▁▆▁▂▁▁▁▁▄▂▄▁▄▁▅▄█▇
  0        6       12       18      23

  🌙 Night owl (38% night sessions)
```

---

## JSON output

For the browser viewer or programmatic use:

```
npx cc-personality --json
```

Paste the output at [yurukusa.github.io/cc-personality](https://yurukusa.github.io/cc-personality/) to see your archetype card.

## How it works

Reads timestamps from JSONL session files in `~/.claude/projects/`.
Computes 10 behavioral signals and matches your dominant pattern.
The archetype tweet link is pre-formatted for easy sharing.

For full usage statistics: [`cc-session-stats`](https://github.com/yurukusa/cc-session-stats)

**→ [See all 27 cc-toolkit tools](https://yurukusa.github.io/cc-toolkit/)**

---

## Requirements

- Node.js 18+
- Claude Code with some session history

## License

MIT
