# Tank Rivals — Thailand vs Myanmar

เกมคลิกสไตล์ arcade สำหรับความบันเทิงเท่านั้น ไม่มีการเมืองและไม่มีความรุนแรงสมจริง ผู้เล่นเลือกฝั่งแล้วกด **FIRE**; หนึ่งคลิกเท่ากับหนึ่ง shot คะแนนส่วนตัวเพิ่มทันทีและ pending shots ถูกเก็บใน `localStorage` ก่อนส่งเป็น batch ทุก 30 วินาที

## Architecture

```text
Browser (instant UI + localStorage + 30s batching)
  → Cloudflare Pages/CDN (static frontend)
  → Cloudflare Worker API (validation, CORS, rate limit)
  → Durable Objects (atomic global counter + per-session/IP limiter)
  → D1 (durable score snapshot)
```

เลือก **Durable Objects** แทน Redis สำหรับ MVP เพราะติดตั้งและ deploy อยู่ใน Cloudflare stack เดียวกัน, request ของ object เดียวถูกจัดลำดับจึงทำ atomic increment ได้โดยไม่ต้องดูแล Redis cluster/connection และสามารถใช้ Durable Object แยกตาม hash ของ IP+session สำหรับ rate limiting ได้ D1 ทำหน้าที่เก็บ snapshot ถาวรและต่อยอด leaderboard ภายหลังได้ สำหรับสเกลระดับสูง ควร shard counter หลาย object แล้ว aggregate คะแนน แทน global object เดียวเมื่อ load test ชี้ว่าจำเป็น

## โครงสร้าง

```text
frontend/              Static Cloudflare Pages site
  assets/battlefield.png
  index.html
  styles.css
  config.js
  app.js
backend/               Cloudflare Worker
  src/index.js
  test/worker.test.js
  schema.sql
  wrangler.toml
  package.json
.env.example
package.json
README.md
```

## 1) Install

ต้องมี Node.js 20+ และ Cloudflare account:

```bash
cd backend
npm install
npx wrangler login
```

## 2) Run local

Terminal 1 — API:

```bash
cd backend
npm run db:local
npm run dev
```

Terminal 2 — frontend (จาก project root):

```bash
npx wrangler pages dev frontend --port 8788
```

ตั้ง `window.TANK_RIVALS_API` ใน `frontend/config.js` ให้ตรงกับ Worker URL ที่ Wrangler แสดง เช่น `http://localhost:8787` แล้วเปิด `http://localhost:8788` คืนค่าเป็น `''` เมื่อต้องการใช้ API origin เดียวกับหน้าเว็บ

## 3) Deploy Cloudflare Pages

```bash
npx wrangler pages project create tank-rivals
npx wrangler pages deploy frontend --project-name tank-rivals
```

ก่อน deploy ให้ใส่ Worker URL จริงใน `frontend/config.js` และตั้ง `ALLOWED_ORIGIN` ใน `backend/wrangler.toml` ให้เป็น Pages URL จริงแบบ exact origin

## 4) Deploy Cloudflare Worker

สร้าง D1 ก่อน จากนั้นนำ `database_id` ที่ได้ไปแทนค่าใน `backend/wrangler.toml`:

```bash
cd backend
npx wrangler d1 create tank-rivals-db
npm run db:remote
npm run deploy
```

Durable Objects ถูกสร้างจาก bindings/migration ใน `wrangler.toml` ระหว่าง deploy โดยอัตโนมัติ

## 5) Redis / Database

MVP ไม่ต้องเชื่อม Redis. `SCORE_COUNTER` เก็บ counter แบบ atomic และเขียน snapshot ล่าสุดลง D1 หลังแต่ละ batch ที่ผ่าน validation หากต้องการ leaderboard จริง ให้เพิ่มตาราง `shooters` ใน D1, ใช้ anonymous player ID แยกจาก session ID และเขียน aggregate ต่อ batch ไม่ใช่ต่อ click

ถ้าต้องย้ายไป Redis ในอนาคต ให้ใช้ผู้ให้บริการที่มี HTTP API สำหรับ Workers และเก็บ token ด้วย `wrangler secret put REDIS_TOKEN` ห้ามใส่ token ใน frontend หรือ commit ลง git

## 6) Environment variables / bindings

| Name | ที่ใช้ | ค่าแนะนำ |
|---|---|---|
| `ALLOWED_ORIGIN` | Worker | Pages origin แบบ exact match |
| `MAX_BATCH_SHOTS` | Worker | `300` |
| `RATE_WINDOW_SECONDS` | Worker | `30` |
| `SCORE_COUNTER` | DO binding | global atomic counter |
| `RATE_LIMITER` | DO binding | limiter ต่อ hashed IP+session |
| `DB` | D1 binding | permanent snapshot |
| `window.TANK_RIVALS_API` | frontend config | Worker public URL |

ค่าที่เป็น secret ให้ตั้งด้วย `wrangler secret put NAME`; โปรเจกต์นี้ไม่มี secret ที่ต้องส่งไป browser

## 7) เปลี่ยนชื่อเกม สี และทีม

- ชื่อ/ข้อความ: `frontend/index.html`
- สี: CSS variables ด้านบนของ `frontend/styles.css`
- team IDs: ต้องแก้ร่วมกันใน `frontend/app.js` (`pending`, labels) และ `backend/src/index.js` (`SIDES`) รวมถึง D1 columns/schema
- ภาพฉาก: แทน `frontend/assets/battlefield.png` ด้วยภาพอัตราส่วนกว้างและคงชื่อไฟล์เดิม
- leaderboard รุ่นแรกเป็น mock data ใน `frontend/app.js` และแยกเป็น object พร้อมเปลี่ยนเป็น API response ภายหลัง

## 8) Load test เบื้องต้น

ทดสอบ staging เท่านั้น อย่ายิง production โดยไม่จำกัดขอบเขต:

```bash
npx autocannon -c 100 -d 20 https://YOUR-WORKER.workers.dev/api/scores
```

POST ต้องใช้ session ID ไม่ซ้ำและอยู่ใต้ rate limit; แนะนำ k6 สำหรับ scenario 30 วินาทีที่จำลองผู้ใช้จำนวนมากส่งหนึ่ง batch ต่อรอบ ตรวจ p95 latency, 429 rate, DO CPU และ D1 writes เริ่มที่ 100–1,000 virtual users แล้วเพิ่มทีละขั้น หาก global DO เริ่มเป็น bottleneck ให้ shard ตาม session hash (เช่น 64 counters) และ aggregate สำหรับ GET

## Validation & security notes

- Frontend ไม่ส่ง request ตอน click; มีเพียง local state/animation และส่ง batch ตาม timer 30 วินาที
- `pending` และ personal total ถูกบันทึกหลังทุก click; refresh/offline ไม่ทำให้แต้มค้างหาย
- ลบ pending เฉพาะหลัง server ตอบสำเร็จ และส่ง Thailand/Myanmar แยก batch เมื่อผู้เล่นเปลี่ยนฝั่งระหว่างรอบ
- API รับเฉพาะ JSON, exact side, integer `shots > 0`, สูงสุด 300/default, UUID session, payload เล็ก และ allowed origin
- rate limit รวม shots และจำนวน requests ต่อ 30 วินาทีจาก hash ของ IP+session; Cloudflare WAF/Turnstile สามารถเพิ่มเมื่อพบ traffic ผิดปกติโดยไม่รบกวนผู้เล่นปกติ
- server เพิ่ม counter เองเท่านั้น; client ไม่สามารถส่ง total score และ Durable Object serialize increments ป้องกัน race condition

รัน tests:

```bash
cd backend
npm test
```

ภาพฉากสร้างด้วย ImageGen built-in จาก prompt: “original wide cartoon arcade battlefield, two toy-like tanks facing inward, Thailand left, Myanmar right, friendly non-realistic style, empty center, no UI text, no blood, no political slogans.”

