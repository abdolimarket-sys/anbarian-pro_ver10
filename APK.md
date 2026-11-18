# ساخت APK

## GitHub Actions

1. پروژه را push کنید (شامل `.github/workflows/build-apk.yml`).
2. بروید **Actions** → workflow **Build Anbarin APK**.
3. در صورت نیاز **Run workflow**.
4. بعد از موفقیت، از **Artifacts** فایل APK را دانلود کنید:
   - با Secrets امضا: `anbarin-release-apk`
   - بدون Secrets: `anbarin-debug-apk`

### آپدیت بدون حذف اپ (Release امضاشده)

برای اینکه نسخه جدید روی نسخه قبلی **آپدیت** شود (نه «حذف کن و دوباره نصب کن»)، باید همیشه با **یک keystore ثابت** امضا شود.

#### یک‌بار: ساخت keystore

```bash
keytool -genkeypair -v \
  -keystore anbarin-release.keystore \
  -alias anbarin \
  -keyalg RSA -keysize 2048 -validity 10000
```

#### تبدیل به base64 (برای GitHub Secret)

```bash
# Linux / macOS / Git Bash
base64 -w 0 anbarin-release.keystore > anbarin-release.keystore.b64
# یا: base64 anbarin-release.keystore | tr -d '\n' > anbarin-release.keystore.b64
```

#### Secrets در GitHub

Repository → **Settings** → **Secrets and variables** → **Actions** → New repository secret:

| Secret | مقدار |
|--------|--------|
| `ANBARIN_KEYSTORE_BASE64` | کل محتوای فایل `.b64` |
| `ANBARIN_KEYSTORE_PASSWORD` | رمز keystore |
| `ANBARIN_KEY_ALIAS` | مثلاً `anbarin` |
| `ANBARIN_KEY_PASSWORD` | رمز کلید |

پس از ذخیره Secrets، workflow بعدی **release امضاشده** می‌سازد.

> کلید را گم نکنید. بدون همان keystore، آپدیت بعدی روی گوشی‌ها ممکن نیست.

### نکات مهم

- `applicationId` باید ثابت بماند: `com.anbarian.app`
- هر انتشار `versionCode` را در `android/app/build.gradle` یکی بالا ببرید
- APK دیباگ و ریلیز را با هم قاطی نکنید؛ امضایشان فرق دارد

## محلی

```bash
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease   # با key.properties یا env
# یا
cd android && ./gradlew assembleDebug
```

- Release: `android/app/build/outputs/apk/release/`
- Debug: `android/app/build/outputs/apk/debug/app-debug.apk`
