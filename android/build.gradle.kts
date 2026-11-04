// Android app: a Trusted Web Activity that opens the live GitHub Pages PWA fullscreen in Chrome.
// See .github/features/android-app.md.
plugins {
    id("com.android.application") version "9.5.0"
}

android {
    namespace = "io.github.minoplay.progressiveoverload"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.minoplay.progressiveoverload"
        minSdk = 26
        targetSdk = 36
        // CI run number, so every new APK installs as an update over the previous one.
        versionCode = System.getenv("GITHUB_RUN_NUMBER")?.toInt() ?: 1
        versionName = "1.0.$versionCode"
    }

    signingConfigs {
        create("release") {
            storeFile = System.getenv("ANDROID_KEYSTORE_PATH")?.let { file(it) }
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = "progressive-overload"
            keyPassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
