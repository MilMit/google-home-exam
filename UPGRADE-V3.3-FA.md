# ارتقا به v3.3 — گزارش کامل ادمین

این نسخه بانک سؤال و نمره‌دهی را تغییر نمی‌دهد. فقط پنل مدیریت و تابع `admin-dashboard` ارتقا یافته‌اند.

## امکانات

- گزارش جزئی هر Attempt
- Security Timeline زمان‌بندی‌شده
- شمارش Tab switch، Camera interruption، Fullscreen exit، Copy/Paste و Network interruption
- نمایش Translation grace برای خروج از Fullscreen
- نمایش Section scores و بخش‌های ضعیف
- نمایش تعداد سؤال پاسخ‌داده‌شده و مدت جلسه
- تولید خودکار متن ایمیل بر اساس گزارش واقعی همان Attempt
- دکمه Copy email و Open email app

## نصب

فایل‌ها را روی مخزن فعلی کپی کنید، سپس فقط تابع زیر را Deploy کنید:

```bash
npx supabase functions deploy admin-dashboard
```

سپس تغییرات سایت را Commit و Push کنید:

```bash
git add .
git commit -m "Add detailed admin integrity reports"
git push origin main
```

Migration جدیدی ندارد و `db push` لازم نیست.
