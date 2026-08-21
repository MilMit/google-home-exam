# ارتقا به v3.4 — تحلیل رفتاری پاسخ‌گویی

این نسخه علاوه بر رویدادهای دوربین، تب، Fullscreen، شبکه و Copy/Paste، رفتار پاسخ‌گویی را نیز برای بررسی یکپارچگی جلسه تحلیل می‌کند.

## چه چیزهایی ثبت می‌شود؟

- مشاهده هر سؤال (`question_view`)
- هر ذخیره پاسخ در سرور (`answer_saved`)
- پاسخ بسیار سریع بعد از مشاهده سؤال
- پاسخ ثبت‌شده بدون مشاهده ثبت‌شده سؤال
- پاسخ در زمانی که تب آزمون مخفی بوده
- تعداد زیاد پاسخ در یک بازه ۳۰ ثانیه‌ای
- تغییرات مکرر پاسخ یک سؤال
- جهش بسیار سریع میان سؤال‌ها
- نمره بالا همراه با زمان تکمیل غیرعادی کوتاه

این سیگنال‌ها به‌تنهایی اثبات تخلف نیستند. سیستم در موارد مشکوک، Attempt را برای بررسی دستی علامت‌گذاری می‌کند.

## نصب

```bash
cd ~/Downloads/google-home-exam-live
npx supabase db push
npx supabase functions deploy save-answer
npx supabase functions deploy log-event
npx supabase functions deploy submit-exam
npx supabase functions deploy admin-dashboard

git add .
git commit -m "Add behavioral integrity monitoring"
git push origin main
```

بعد از سبزشدن GitHub Actions، سایت را با Ctrl+Shift+R بازخوانی کنید.

## نکته درباره هزینه

این نسخه عکس یا ویدئو ذخیره نمی‌کند. فقط رویدادهای متنی کوچک به جدول `attempt_events` اضافه می‌شوند. هر آزمون حدود چند ده تا چند صد رویداد کوچک ایجاد می‌کند؛ برای استفاده معمول، سربار بسیار کمتری از ذخیره رسانه دارد.
