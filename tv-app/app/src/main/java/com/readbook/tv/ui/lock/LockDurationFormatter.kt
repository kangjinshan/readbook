package com.readbook.tv.ui.lock

object LockDurationFormatter {

    fun format(totalSeconds: Long): String {
        val safeSeconds = totalSeconds.coerceAtLeast(0)
        val hours = safeSeconds / 3600
        val minutes = (safeSeconds % 3600) / 60
        val seconds = safeSeconds % 60
        return String.format("%02d:%02d:%02d", hours, minutes, seconds)
    }
}
