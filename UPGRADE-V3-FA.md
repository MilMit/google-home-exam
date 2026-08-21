# ارتقا به v3 — ترجمه، دوربین، یکپارچگی و پنل ادمین

این نسخه هیچ عکس یا ویدئویی را ذخیره نمی‌کند. دوربین فقط به‌صورت live preview در مرورگر نمایش داده می‌شود.

## 1) فایل‌ها را روی مخزن live کپی کنید

```bash
cp -a ~/Downloads/public-repo-v3/. ~/Downloads/google-home-exam-live/
cd ~/Downloads/google-home-exam-live
```

## 2) Migration جدید

```bash
npx supabase link --project-ref lcherkxyrpmgkokkbhjs
npx supabase db push
```

## 3) Edge Functions

```bash
npx supabase functions deploy start-exam
npx supabase functions deploy log-event
npx supabase functions deploy submit-exam
npx supabase functions deploy admin-dashboard
```

## 4) ساخت حساب ادمین

ابتدا با یک ایمیل واقعی در سایت یا Supabase Auth یک حساب بسازید و آن را تأیید کنید. سپس در Supabase SQL Editor این دستور را اجرا کنید و ایمیل خودتان را جایگزین کنید:

```sql
insert into public.admin_users (user_id, admin_id, display_name)
select id, 'GH-ADMIN-01', 'Primary Administrator'
from auth.users
where email = 'YOUR-ADMIN-EMAIL@example.com'
on conflict (user_id) do update
set admin_id = excluded.admin_id,
    display_name = excluded.display_name,
    is_active = true;
```

ورود ادمین از دکمه Admin سایت انجام می‌شود. سه مورد لازم است:

- Admin ID: `GH-ADMIN-01`
- Admin email: همان ایمیلی که در SQL بالا مجاز کرده‌اید
- Password: رمز همان حساب Supabase Auth

## 5) GitHub

```bash
git add .
git commit -m "Add translation assistance, camera integrity and admin dashboard"
git push origin main
```

## 6) نتیجه آزمون

نتیجه بلافاصله بعد از Submit نمایش داده می‌شود و شامل این موارد است:

- Academic score
- Passed / Not passed / Pending review
- Section scores
- Integrity score
- Time used
- Browser translation declaration

پاسخ‌های صحیح نمایش داده نمی‌شوند.

## Integrity

رویدادهای زیر فقط به‌صورت متنی ثبت می‌شوند و هیچ ویدئو یا عکس ذخیره نمی‌شود:

- tab_hidden
- fullscreen_exit
- camera_stopped
- network_offline
- copy_attempt
- paste_attempt

اگر Browser Translation از قبل اعلام شده باشد، اولین خروج از fullscreen به‌عنوان grace برای استفاده از ترجمه مرورگر از جریمه Integrity حذف می‌شود.
