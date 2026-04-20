package com.readbook.tv.util

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.View
import androidx.annotation.ColorInt
import androidx.annotation.ColorRes
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils

object AppBrightnessController {
    fun applyWindowBackground(activity: Activity, preferenceManager: PreferenceManager, @ColorRes baseColorRes: Int) {
        applyWindowBackgroundColor(
            activity = activity,
            baseColor = ContextCompat.getColor(activity, baseColorRes),
            preferenceManager = preferenceManager
        )
    }

    fun applyWindowBackground(activity: Activity, preferenceManager: PreferenceManager, theme: Theme) {
        applyWindowBackgroundColor(
            activity = activity,
            baseColor = Color.parseColor(theme.backgroundColor),
            preferenceManager = preferenceManager
        )
    }

    fun applyOverlay(overlayView: View, preferenceManager: PreferenceManager) {
        overlayView.alpha = preferenceManager.readerBrightness.overlayAlpha
    }

    private fun applyWindowBackgroundColor(
        activity: Activity,
        @ColorInt baseColor: Int,
        preferenceManager: PreferenceManager
    ) {
        val dimmedColor = ColorUtils.blendARGB(
            baseColor,
            Color.BLACK,
            preferenceManager.readerBrightness.overlayAlpha
        )
        activity.window.setBackgroundDrawable(ColorDrawable(dimmedColor))
    }
}
