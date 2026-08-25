# AIWAKU — HANDOFF / CONTINUATION CONTEXT

> WAJIB DIBACA sebelum melanjutkan pekerjaan AIWAKU.
>
> Dokumen ini adalah konteks handoff untuk AI/engineer berikutnya agar pekerjaan dilanjutkan dari kondisi repository dan production evidence yang sudah diverifikasi, bukan mengulang pekerjaan atau menebak kondisi database.

## 1. CURRENT STATE

Project: AIWAKU
Branch: main

Known audit commit:

ba832f0 chore: add production database audit

Commit tersebut sudah dipush ke origin/main.

Repository + production evidence adalah sumber kebenaran.
Chat history hanya konteks tambahan.

Jika chat history bertentangan dengan repository, migration, atau production evidence:
1. cek Git;
2. cek migration;
3. cek production audit/snapshot;
4. jangan menebak.

## 2. DEPLOYED BASELINE

Baseline deployed AIWAKU yang telah disepakati sebelumnya berasal dari source tree Aiwaku-main (5).zip, baseline per 23 Agustus 2026.

App deployed:
https://aiwaku.vercel.app

Jangan menganggap ZIP lama sebagai state yang lebih baru daripada Git.

## 3. COMPLETED AUDIT WORK

Sudah dibuat/disimpan:

docs/production/SUPABASE_AUDIT_LOG-1.md
docs/production/SUPABASE_AUDIT_LOG-2.md
docs/production/SUPABASE_SCHEMA_SNAPSHOT_2026-08-25.sql

Snapshot tersebut adalah production schema evidence yang digunakan pada audit 25 Agustus 2026.

Automated audit:

scripts/db-audit.mjs

NPM commands:

npm run db:audit
npm run db:audit:strict

npm run db:audit telah berhasil dan menghasilkan:

AUDIT OK

PENTING:
AUDIT OK berarti repository/audit artifact checks yang dilakukan script lolos.
Itu BUKAN bukti bahwa seluruh production database, security, payment,
WhatsApp, atau application flow sudah production-ready.

## 4. V65

Migration:

supabase/migrations/20260830_v65_revoke_anon_rpc_access.sql

Sudah diverifikasi terhadap HEAD:

V65 IDENTIK DENGAN HEAD

Jangan membuat ulang atau mengubah V65 hanya karena AI berikutnya tidak langsung melihat history-nya.

V65 berkaitan dengan RPC/anon execution hardening dan cleanup overload lama create_order_atomic.

create_order_atomic:
- overload lama: 9 parameter
- versi yang diaudit: 10 parameter
- versi baru menggunakan p_idempotency_key

Selalu cek actual production grants/catalog sebelum mengubah RPC security.

## 5. PRODUCTION AUDIT FINDINGS

Audit mencakup:

- RPC security
- create_order_atomic
- default function privileges
- WhatsApp conversations
- WhatsApp messages
- orders
- v6.7 readiness
- baseline artifacts
- final decision

Production sudah memiliki:

wa_conversations
wa_messages
provider_message_id

Active conversation memiliki uniqueness boundary berdasarkan tenant + customer WhatsApp untuk status active.

Namun durable inbox v6.7 BELUM boleh dianggap selesai hanya karena source/migration ZIP tersedia.

Gap yang harus diverifikasi:

UNIQUE (tenant_id, provider_message_id)
processing_status
processing_started_at
processing_attempts
processing_error
processed_at
claim/finish/retry semantics

Audit juga menemukan kebutuhan korelasi order → conversation perlu diperjelas, termasuk kemungkinan orders.wa_conversation_id.

Jangan menjalankan full v6.7 migration secara blind.

## 6. PAYMENT

Payment work sebelumnya mencakup:

- atomic pending-payment reservation
- rate limiting
- race-condition protection tertentu

Namun payment belum boleh dianggap production-complete.

Masih perlu verifikasi:

- deterministic provider order ID / idempotency
- recovery jika provider sukses tetapi DB update gagal
- strict payment state transitions
- stuck reservation recovery
- webhook/reconciliation behavior

Payment product decision:

1. Cash
2. QRIS Static
3. QRIS Dynamic Midtrans

Metode dipilih per transaksi oleh staff/tenant.
Pembayaran ditujukan langsung ke tenant masing-masing.

## 7. ORDER / INVENTORY / KITCHEN

Fondasi yang sudah dibangun:

- order atomicity
- idempotency
- stock locking/decrement
- fulfillment_status
- recipe/inventory intelligence
- inventory mutation boundary
- admin checks untuk mutation tertentu

V5.5/V5.7 dan security hardening inventory harus dibaca sebelum mengubah inventory.

Jangan membuka kembali broad member mutation policy hanya untuk mempermudah implementasi.

## 8. BUSINESS FLOW

Arsitektur diarahkan untuk:

- order
- booking
- service
- membership
- hybrid

Namun tidak semua executor production sudah lengkap.

Jangan mengklaim booking/service/membership sudah end-to-end hanya karena tipe/configuration/UI tersedia.

Core order flow adalah area yang paling matang.

## 9. DEMO VS PRODUCTION

Audit menemukan area frontend yang masih perlu diverifikasi untuk pemisahan demo/localStorage/mock dari production DB.

Prinsip:

DEMO_MODE != PRODUCTION

Production DB kosong harus benar-benar terlihat kosong.

Audit kembali:

- bookings
- customers
- live chat/inbox
- localStorage fallback
- mock/demo data

## 10. DATABASE / MIGRATION RULES

JANGAN:

- supabase db push seluruh migration history secara blind
- menjalankan ZIP migration tanpa reconciliation
- overwrite production schema
- membuat ulang migration yang sudah ada di HEAD
- menganggap migration history sama dengan actual production schema
- menganggap grep sebagai bukti PostgreSQL catalog
- membuat migration baru tanpa mengetahui actual production state

Workflow wajib:

production actual
      ↓
catalog/evidence
      ↓
compare with migration/design
      ↓
exact gap
      ↓
smallest safe migration
      ↓
review
      ↓
apply
      ↓
verify
      ↓
new snapshot/audit

## 11. FIRST COMMANDS

Sebelum mengubah apa pun:

git status --short
git log --oneline -10
git show --stat --oneline ba832f0
npm run db:audit

Baca minimal:

docs/production/SUPABASE_AUDIT_LOG-2.md
docs/production/SUPABASE_SCHEMA_SNAPSHOT_2026-08-25.sql
supabase/migrations/20260830_v65_revoke_anon_rpc_access.sql

Jika menyentuh WhatsApp, baca migration/folder WhatsApp terlebih dahulu.

## 12. CURRENT NEXT TASK

Production catalog reconciliation before v6.7 durable inbox migration.

JANGAN langsung apply v6.7.

Lakukan read-only catalog audit untuk:

1. triggers
2. indexes/constraints pada wa_messages, wa_conversations, orders
3. actual columns wa_messages
4. actual columns orders
5. actual public functions terkait WhatsApp/conversation/order
6. grants/execute privileges bila diperlukan

Kemudian bandingkan:

actual production
       vs
v6.7 desired state

Hasilnya harus berupa daftar gap eksplisit.

Baru kemudian buat reconciliation migration terkecil.

## 13. COMPLETED WORK — DO NOT REPEAT

Sudah dilakukan:

- production schema snapshot dibuat
- production audit logs dibuat
- automated audit script dibuat
- db:audit dan db:audit:strict ditambahkan
- npm run db:audit berhasil
- V65 dibandingkan dengan HEAD dan identik
- accidental V65 deletion dipulihkan
- audit changes dikomit
- commit ba832f0 dibuat
- commit dipush ke origin/main

AI berikutnya harus memverifikasi keadaan ini, bukan mengulangnya.

## 14. HANDOFF PRINCIPLE

AIWAKU sedang berada dalam fase remediation / production hardening.

Prioritas:

1. preserve production state
2. preserve security boundaries
3. reconcile actual DB vs migration/design
4. make the smallest safe change
5. verify with tests/catalog/audit
6. document evidence
7. commit
8. push only after verification

Jika ada ketidakpastian tentang kondisi database:
BERHENTI DAN AUDIT ACTUAL STATE.
Jangan menebak.
