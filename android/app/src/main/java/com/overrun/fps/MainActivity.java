package com.overrun.fps;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * From API 35 an app can no longer ask the framework to lay out inside the
 * system bars - the window is always edge to edge and the bars float on top. For
 * a game whose FIRE button lives in the bottom corner that is not cosmetic: the
 * navigation bar would sit on the control the player needs most.
 *
 * <p><b>The navigation bar stays.</b> Hiding it costs the pause gesture. With
 * {@code hide(Type.systemBars())} the system eats the first BACK press, and
 * BACK is how this game pauses - a player who cannot pause loses the round.
 * Measured, not assumed: on one emulator with nothing else attached, the suite
 * in {@code tests/android.spec.js} is 16/17 with the navigation bar hidden and
 * 17/17 without, the failure being "the back button pauses the match". The
 * documentation for {@code BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE} says bars are
 * revealed by a swipe and implies BACK is untouched; the device disagrees.
 *
 * <p><b>The status bar goes.</b> Players read the strip at the top as the game
 * failing to go fullscreen. Hiding only {@code Type.statusBars()} leaves the
 * navigation bar alone and keeps BACK - 17/17 on two consecutive runs of the
 * same suite. The inset listener below needs no special case: it asks for live
 * insets, and {@code getInsets} reports zero for a bar that is hidden, so the
 * top padding collapses to the display cutout on its own.
 *
 * <p>If either half is re-litigated, do it with a device run attached and with
 * exactly one emulator connected. Two suites sharing a device tear down each
 * other's WebView and the failures land on whichever test happens to be running.
 */
public class MainActivity extends BridgeActivity {

    /** Same colour as --bg in src/styles/base.css, so the inset strip disappears. */
    private static final int BACKGROUND = Color.parseColor("#05070C");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat bars =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
        bars.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        bars.hide(WindowInsetsCompat.Type.statusBars());

        final View content = findViewById(android.R.id.content);
        content.setBackgroundColor(BACKGROUND);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
