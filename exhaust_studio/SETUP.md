# ExhaustStudio 650 — Setup Guide

## 1. Project structure

```
exhaust_studio/
├── pubspec.yaml            ← dependencies
├── lib/
│   └── main.dart           ← complete app
└── android/
    └── MainActivity.kt     ← copy into your Android module (see below)
```

---

## 2. Place MainActivity.kt

Copy `android/MainActivity.kt` into your project at:

```
android/app/src/main/kotlin/<your/package/path>/MainActivity.kt
```

The default Flutter package path is `com/example/exhaust_studio`.
If you created the project with a custom org, adjust the `package` declaration at the top of the file to match.

---

## 3. AndroidManifest.xml — add these permissions

Open `android/app/src/main/AndroidManifest.xml` and add inside `<manifest>`:

```xml
<!-- Read videos from gallery (Android 13+) -->
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />

<!-- Fallback for Android 12 and below -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32" />

<!-- Write to public Movies folder (needed below API 29) -->
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
    android:maxSdkVersion="28" />
```

No `WRITE_EXTERNAL_STORAGE` is needed on Android 10+ — the app writes to
`Environment.DIRECTORY_MOVIES` which is a public directory accessible via
scoped storage without that permission.

---

## 4. android/app/build.gradle — minSdk & ABI filters

Open `android/app/build.gradle` and update the `defaultConfig` block:

```groovy
android {
    defaultConfig {
        minSdkVersion 24        // ffmpeg_kit_flutter requires API 24 minimum
        targetSdkVersion 34
        ...
    }

    // ABI filters — include only the ABIs you ship to reduce APK size
    // Remove arm64-v8a if you need to support older 32-bit devices only
    splits {
        abi {
            enable true
            reset()
            include "arm64-v8a", "armeabi-v7a", "x86_64"
            universalApk false   // set true if you need a fat APK for testing
        }
    }
}
```

### Size notes

| ABI filter set | Approx. added size (ffmpeg_kit .so) |
|---|---|
| arm64-v8a only | ~38 MB |
| arm64-v8a + armeabi-v7a | ~58 MB |
| All 4 ABIs (universal) | ~120 MB |

Use `splits.abi` in development and let the Play Store handle per-device APK
splitting in production (upload an AAB instead of APK).

---

## 5. Install dependencies

```bash
flutter pub get
```

---

## 6. Build & run

```bash
flutter run --release   # release mode skips debug overhead — FFmpeg is faster
```

---

## 7. How sliders map to the FFmpeg filter chain

| Slider | Left (0%) | Right (100%) |
|---|---|---|
| Noise Cleanup | highpass=60Hz, lowpass=9000Hz | highpass=180Hz, lowpass=4000Hz |
| Exhaust Deepness | 200Hz EQ +0dB (flat) | 200Hz EQ +12dB |

The full `-af` chain is printed to the debug console every time you tap
**Enhance & Save to Gallery** — look for `[ExhaustStudio] Running FFmpeg:`.

---

## 8. Output location

Processed videos are saved to:

```
/sdcard/Movies/ExhaustStudio/ExhaustStudio_<timestamp>.mp4
```

The MediaScanner is triggered immediately so the file appears in the system
Gallery app without needing to reboot the device.

---

## 9. Performance notes

- `-c:v copy` means the video track is **never decoded or re-encoded**.
  Only the audio stream is processed, so a 2-minute 4K video typically
  exports in under 5 seconds on mid-range Android hardware.
- `ffmpeg_kit_flutter_video` (LTS bundle) includes all audio filters used
  in the pipeline (`highpass`, `lowpass`, `equalizer`, `acompressor`,
  `volume`, `alimiter`). No additional codec packs needed.

---

## 10. Troubleshooting

### "minSdkVersion must be at least 24"
Set `minSdkVersion 24` in `android/app/build.gradle` (see step 4).

### APK too large (>150 MB)
Enable ABI splits (see step 4). For Play Store distribution, upload an AAB
(`flutter build appbundle`) — Google Play delivers per-device splits automatically.

### Video doesn't appear in Gallery after processing
Ensure `scanFile` MethodChannel call succeeds. Check logcat for
`[ExhaustStudio]` tags. On Android 11+ the media scanner delay can be up to
a few seconds — wait before checking Gallery.

### FFmpeg session returns non-zero exit code
The full FFmpeg log is printed via `debugPrint`. Run with `flutter run` (not
`--release`) and check the console for the exact error line from FFmpeg.
Common causes: unsupported input codec, corrupt source file, insufficient
storage space for the output.
