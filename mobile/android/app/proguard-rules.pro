# RiftCompare release (R8) rules.
#
# Capacitor's own AAR contributes consumerProguardFiles that keep every
# @CapacitorPlugin class, its @PluginMethod/@PermissionCallback/@ActivityCallback
# members and anything extending com.getcapacitor.Plugin. These are the extra
# keeps this app needs on top of that.

# The JS↔native bridge is reached only through @JavascriptInterface, i.e. by name
# from JavaScript, so R8 sees no caller and would otherwise strip or rename it.
# (proguard-android-optimize.txt carries the same rule; it is repeated here so a
# change of default config file can't silently remove the bridge.)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# MainActivity is named as a string in AndroidManifest.xml and in the launcher
# shortcut intents (res/xml/shortcuts.xml), never referenced from code.
-keep class com.riftcompare.app.MainActivity { *; }

# Google Mobile Ads / Play Services load mediation adapters reflectively.
-keep class com.google.android.gms.ads.** { *; }
-dontwarn com.google.android.gms.ads.**

# Firebase Messaging (price-drop push) resolves its service from the manifest.
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Keep source file + line numbers so Play Console crash reports stay readable,
# then hide the original file name. Without this a stack trace from the store is
# a list of obfuscated frames with no line information.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
