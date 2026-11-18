# راهنمای اجرای انبارین روی گوشی اندروید

## پیش‌نیازها
- Node.js نسخه ۲۲
- نصب وابستگی‌های پروژه با `npm ci`
- Android Studio و Android SDK نصب‌شده
- JDK 17
- فعال‌بودن USB debugging روی گوشی (برای نصب مستقیم)

## ساخت APK قابل نصب
در ریشه پروژه اجرا کنید:

```bash
npm ci
npm run android:debug
```

این دستور ابتدا `build:web` و `cap sync android` را اجرا می‌کند و سپس APK نسخه Debug را می‌سازد.

مسیر خروجی:

`android/app/build/outputs/apk/debug/app-debug.apk`

## نصب روی گوشی متصل با USB
پس از فعال‌کردن USB debugging و تأیید رایانه روی گوشی:

```bash
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

یا فایل APK را به گوشی منتقل و نصب کنید. ممکن است لازم باشد اجازه نصب از این منبع را در تنظیمات اندروید فعال کنید.

## ساخت از GitHub Actions
Workflow فایل `.github/workflows/main.yml` پس از اجرای تست‌ها، TypeScript و Vite، دستور `cap sync android` و ساخت Gradle را اجرا می‌کند. در نبود کلید امضای Release، خروجی Debug تولید می‌شود و با نام `anbarin-debug-apk` به‌عنوان Artifact در اجرای Workflow قرار می‌گیرد.

## نکات مهم
- APK نسخه Debug برای نصب و آزمایش است؛ برای انتشار عمومی باید کلید امضای Release امن و اختصاصی تنظیم شود.
- قبل از نصب روی دستگاه اصلی، از اطلاعات انبارین نسخه پشتیبان تهیه کنید.
- پس از نصب، دوربین/اسکن بارکد، ذخیره و بازیابی فایل، اعلان سررسید، چاپ، ورود و خروج برنامه و کارکرد آفلاین را روی گوشی واقعی آزمایش کنید.
- `android:debug` فقط APK می‌سازد؛ نصب روی گوشی جداگانه با Android Studio یا `adb install` انجام می‌شود.
