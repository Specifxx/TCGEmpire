package com.riftcompare.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * The app's two native extras on top of Capacitor's WebView of riftcompare.com
 * (2.0.0, 2026-11-27):
 *
 * 1. Pull to refresh. Prices move through the day; a swipe down at the top of a
 *    page reloads it, like every native shopping app. The swipe only arms when
 *    the page itself is scrolled to the very top, so it never fights the page's
 *    own scrolling.
 *
 * 2. Play in-app updates. When Play has a newer build (testers get them often),
 *    the app offers Play's own update screen on launch instead of waiting for
 *    the store to auto-update overnight. The user can always decline; the check
 *    is silent when there is nothing new or Play is unavailable (sideloads).
 *
 * Insets (status and navigation bars) are applied as padding on the decor view
 * by Capacitor's SystemBars plugin, so wrapping the WebView here does not move
 * the page under the bars.
 */
public class MainActivity extends BridgeActivity {

    private static final int UPDATE_REQUEST = 4021;
    private static final long REFRESH_TIMEOUT_MS = 10_000;

    private SwipeRefreshLayout swipe;
    private AppUpdateManager updates;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge == null || bridge.getWebView() == null) return;
        installPullToRefresh(bridge.getWebView());
        checkForUpdate();
    }

    private void installPullToRefresh(WebView webView) {
        ViewGroup parent = (ViewGroup) webView.getParent();
        if (parent == null) return;
        int index = parent.indexOfChild(webView);
        ViewGroup.LayoutParams params = webView.getLayoutParams();
        parent.removeView(webView);

        swipe = new SwipeRefreshLayout(this);
        swipe.addView(webView, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        parent.addView(swipe, index, params);

        swipe.setColorSchemeColors(ContextCompat.getColor(this, R.color.colorAccent));
        swipe.setProgressBackgroundColorSchemeColor(ContextCompat.getColor(this, R.color.refreshBackground));
        // A deliberate pull, not a flick at the top of a list.
        float density = getResources().getDisplayMetrics().density;
        swipe.setDistanceToTriggerSync((int) (120 * density));
        // Only arm when the document is at the very top.
        swipe.setOnChildScrollUpCallback((p, child) -> webView.getScrollY() > 0);
        swipe.setOnRefreshListener(() -> {
            webView.reload();
            main.postDelayed(() -> swipe.setRefreshing(false), REFRESH_TIMEOUT_MS);
        });

        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView view) {
                    stopRefreshing();
                }

                @Override
                public void onReceivedError(WebView view) {
                    stopRefreshing();
                }
            }
        );
    }

    private void stopRefreshing() {
        if (swipe != null) main.post(() -> swipe.setRefreshing(false));
    }

    private void checkForUpdate() {
        try {
            updates = AppUpdateManagerFactory.create(this);
            updates
                .getAppUpdateInfo()
                .addOnSuccessListener(info -> {
                    if (
                        info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
                        info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
                    ) {
                        startUpdate(info);
                    }
                });
        } catch (Exception ignored) {
            // Not installed from Play (sideload, emulator): nothing to offer.
        }
    }

    private void startUpdate(AppUpdateInfo info) {
        try {
            updates.startUpdateFlowForResult(info, this, AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(), UPDATE_REQUEST);
        } catch (Exception ignored) {
            // The update screen could not open; the store will update the app later.
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // An immediate update the user started and then left must be resumed,
        // or Play leaves it half done.
        if (updates == null) return;
        updates
            .getAppUpdateInfo()
            .addOnSuccessListener(info -> {
                if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
                    startUpdate(info);
                }
            });
    }
}
