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
 * <p>Hiding the bars outright looks tempting and is what most engines do, but on
 * Android the system then swallows the first BACK press to bring them back, and
 * BACK is how this game pauses. So the bars stay, and instead the WebView is
 * inset by exactly the space they occupy - the behaviour the framework used to
 * provide, asked for explicitly.
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
